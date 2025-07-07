package main

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gotd/td/telegram"
	"github.com/gotd/td/telegram/auth"
	"github.com/gotd/td/tg"
	"github.com/joho/godotenv"
)

type GiftsService struct {
	client    *telegram.Client
	raw       *tg.Client
	ctx       context.Context
	cancel    context.CancelFunc
	appID     int
	appHash   string
	isRunning bool
	cache     map[string]CacheEntry
	cacheMux  sync.RWMutex
	// Добавляем кеш по user_id
	userCache    map[int64]UserCacheEntry
	userCacheMux sync.RWMutex
}

type CacheEntry struct {
	Data      []Gift
	Timestamp time.Time
	TTL       time.Duration
}

type Gift struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Model    string `json:"model"`
	Backdrop string `json:"backdrop"`
}

type GiftRequest struct {
	Username string `json:"username" binding:"required"`
	UserID   int64  `json:"user_id" binding:"required"`
}

type GiftResponse struct {
	Success  bool   `json:"success"`
	Gifts    []Gift `json:"gifts,omitempty"`
	Count    int    `json:"count"`
	Error    string `json:"error,omitempty"`
	Duration string `json:"duration,omitempty"`
}

type UserCacheEntry struct {
	Gifts     []Gift
	Timestamp time.Time
	TTL       time.Duration
	Username  string
}

func NewGiftsService() *GiftsService {
	return &GiftsService{
		cache:     make(map[string]CacheEntry),
		userCache: make(map[int64]UserCacheEntry),
	}
}

func (gs *GiftsService) Initialize(ctx context.Context) error {
	// Сначала пробуем загрузить .env файл, но не критично если его нет
	if err := godotenv.Load(); err != nil {
		log.Println("Info: .env file not found, using environment variables")
	}

	// Проверяем переменные окружения (они могут быть переданы через Docker)
	appIDStr := os.Getenv("API_ID")
	if appIDStr == "" {
		appIDStr = getEnvOrDefault("API_ID", "")
	}

	if appIDStr == "" {
		log.Printf("❌ API_ID environment variable is required")
		log.Printf("Available environment variables: API_ID=%s, API_HASH=%s, BOT_TOKEN=%s",
			os.Getenv("API_ID"),
			maskString(os.Getenv("API_HASH")),
			maskString(os.Getenv("BOT_TOKEN")))
		return fmt.Errorf("API_ID environment variable is required")
	}

	var err error
	gs.appID, err = strconv.Atoi(appIDStr)
	if err != nil || gs.appID == 0 {
		log.Printf("❌ Invalid API_ID: %s", appIDStr)
		return fmt.Errorf("invalid API_ID: %s", appIDStr)
	}

	gs.appHash = os.Getenv("API_HASH")
	if gs.appHash == "" {
		log.Printf("❌ API_HASH environment variable is required")
		return fmt.Errorf("API_HASH environment variable is required")
	}

	log.Printf("✅ Configuration loaded: API_ID=%d, API_HASH=%s", gs.appID, maskString(gs.appHash))

	gs.client = telegram.NewClient(gs.appID, gs.appHash, telegram.Options{
		SessionStorage: &telegram.FileSessionStorage{
			Path: "session.json",
		},
	})

	gs.ctx, gs.cancel = context.WithCancel(context.Background())

	go func() {
		err := gs.client.Run(gs.ctx, func(ctx context.Context) error {
			gs.raw = gs.client.API()

			status, err := gs.client.Auth().Status(ctx)
			if err != nil {
				return fmt.Errorf("failed to get auth status: %w", err)
			}

			if !status.Authorized {
				// Приоритет: сначала пробуем bot token, потом phone
				botToken := os.Getenv("BOT_TOKEN")
				if botToken != "" {
					log.Println("Attempting bot authentication...")
					return gs.authenticateBot(ctx, botToken)
				}

				phone := os.Getenv("PHONE")
				if phone != "" {
					log.Println("Attempting user authentication...")
					return gs.authenticateUser(ctx, phone)
				}

				return fmt.Errorf("need BOT_TOKEN or PHONE environment variable")
			}

			log.Println("Telegram client authenticated successfully")
			gs.isRunning = true
			<-ctx.Done()
			return nil
		})

		if err != nil {
			log.Printf("Telegram client error: %v", err)
		}
	}()

	// Ждем инициализации
	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled")
		default:
			if gs.isRunning && gs.raw != nil {
				return nil
			}
			time.Sleep(100 * time.Millisecond)
		}
	}
}

func (gs *GiftsService) authenticateUser(ctx context.Context, phone string) error {
	flow := auth.NewFlow(
		auth.Constant(phone, "", auth.CodeAuthenticatorFunc(func(ctx context.Context, sentCode *tg.AuthSentCode) (string, error) {
			fmt.Print("Enter code: ")
			var code string
			if _, err := fmt.Scanln(&code); err != nil {
				return "", err
			}
			return code, nil
		})),
		auth.SendCodeOptions{},
	)
	return gs.client.Auth().IfNecessary(ctx, flow)
}

func (gs *GiftsService) authenticateBot(ctx context.Context, token string) error {
	flow := auth.NewFlow(
		auth.Test(rand.Reader, gs.appID),
		auth.SendCodeOptions{},
	)
	return gs.client.Auth().IfNecessary(ctx, flow)
}

func (gs *GiftsService) GetUserGifts(ctx context.Context, username string) ([]Gift, error) {
	if !gs.isRunning || gs.raw == nil {
		return nil, fmt.Errorf("telegram client not initialized")
	}

	log.Printf("Fetching gifts for username @%s", username)
	start := time.Now()

	// Проверяем контекст
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Убираем @ если есть
	cleanUsername := username
	if len(cleanUsername) > 0 && cleanUsername[0] == '@' {
		cleanUsername = cleanUsername[1:]
	}

	// СНАЧАЛА проверяем кеш по username
	if cachedGifts := gs.getCachedGifts(cleanUsername); cachedGifts != nil {
		log.Printf("Cache HIT for username @%s: %d gifts (saved API call)", cleanUsername, len(cachedGifts))
		return cachedGifts, nil
	}

	// Получаем информацию о пользователе
	userCtx, userCancel := context.WithTimeout(ctx, 10*time.Second)
	user, err := gs.resolveUsername(userCtx, cleanUsername)
	userCancel()

	if err != nil {
		return nil, fmt.Errorf("failed to resolve username @%s: %w", cleanUsername, err)
	}

	log.Printf("Resolved username @%s to user ID %d", cleanUsername, user.ID)

	// Проверяем кеш по user_id ПОСЛЕ получения ID
	if cachedGifts := gs.getCachedGiftsByUserID(user.ID); cachedGifts != nil {
		log.Printf("Cache HIT for user_id %d (@%s): %d gifts (saved API call)", user.ID, cleanUsername, len(cachedGifts))
		// Кешируем также по username для будущих запросов
		gs.setCachedGifts(cleanUsername, cachedGifts, 30*time.Minute)
		return cachedGifts, nil
	}

	// Получаем подарки
	gifts, err := gs.getSavedStarGiftsAPI(ctx, user)
	if err != nil {
		log.Printf("Primary method failed for username @%s: %v", cleanUsername, err)
		return nil, fmt.Errorf("failed to get gifts: %w", err)
	}

	log.Printf("Successfully fetched %d gifts for @%s in %v", len(gifts), cleanUsername, time.Since(start))
	return gifts, nil
}

func (gs *GiftsService) resolveUsername(ctx context.Context, username string) (*tg.User, error) {
	// Убираем @ если есть
	if len(username) > 0 && username[0] == '@' {
		username = username[1:]
	}

	// Если username — это числовой user_id, ищем напрямую
	if id, err := strconv.ParseInt(username, 10, 64); err == nil {
		users, err := gs.raw.UsersGetUsers(ctx, []tg.InputUserClass{
			&tg.InputUser{
				UserID:     id,
				AccessHash: 0,
			},
		})
		if err == nil && len(users) > 0 {
			if user, ok := users[0].(*tg.User); ok {
				return user, nil
			}
		}
	}

	// Поиск по username
	resolved, err := gs.raw.ContactsResolveUsername(ctx, &tg.ContactsResolveUsernameRequest{
		Username: username,
	})
	if err != nil {
		return nil, err
	}

	// Ищем пользователя в результатах
	for _, user := range resolved.Users {
		if u, ok := user.(*tg.User); ok {
			return u, nil
		}
	}

	return nil, fmt.Errorf("user not found")
}

func (gs *GiftsService) getSavedStarGiftsAPI(ctx context.Context, user *tg.User) ([]Gift, error) {
	peer := &tg.InputPeerUser{
		UserID:     user.ID,
		AccessHash: user.AccessHash,
	}

	var allGifts []Gift
	offset := ""
	limit := 100
	requestCount := 0
	consecutiveErrors := 0
	maxErrors := 2
	consecutiveEmptyBatches := 0
	maxEmptyBatches := 2

	log.Printf("Starting gift fetching for user %d", user.ID)

	for {
		// Проверяем контекст перед каждым запросом
		select {
		case <-ctx.Done():
			log.Printf("Context cancelled after %d requests, returning %d gifts", requestCount, len(allGifts))
			return allGifts, nil
		default:
		}

		requestCount++

		reqCtx, reqCancel := context.WithTimeout(ctx, 5*time.Second)

		start := time.Now()
		resp, err := gs.raw.PaymentsGetSavedStarGifts(reqCtx, &tg.PaymentsGetSavedStarGiftsRequest{
			Peer:   peer,
			Offset: offset,
			Limit:  limit,
		})
		reqCancel()
		requestDuration := time.Since(start)

		if err != nil {
			consecutiveErrors++
			log.Printf("Batch #%d FAILED in %v (error %d/%d): %v", requestCount, requestDuration, consecutiveErrors, maxErrors, err)

			if ctx.Err() != nil {
				log.Printf("Context error detected, returning %d gifts collected so far", len(allGifts))
				return allGifts, nil
			}

			if consecutiveErrors >= maxErrors {
				if len(allGifts) > 0 {
					log.Printf("Max errors reached, returning %d gifts collected so far", len(allGifts))
					return allGifts, nil
				}
				return nil, fmt.Errorf("failed to fetch gifts after %d consecutive errors: %w", consecutiveErrors, err)
			}

			sleepTime := time.Duration(consecutiveErrors) * 500 * time.Millisecond
			select {
			case <-time.After(sleepTime):
			case <-ctx.Done():
				return allGifts, nil
			}
			continue
		}

		consecutiveErrors = 0

		if len(resp.Gifts) == 0 {
			consecutiveEmptyBatches++
			log.Printf("Batch #%d EMPTY in %v (empty %d/%d)", requestCount, requestDuration, consecutiveEmptyBatches, maxEmptyBatches)

			if consecutiveEmptyBatches >= maxEmptyBatches {
				log.Printf("Too many empty batches, finishing with %d gifts", len(allGifts))
				break
			}

			if resp.NextOffset != "" {
				offset = resp.NextOffset
			} else {
				offset = fmt.Sprintf("%d", requestCount*limit)
			}
			continue
		}

		consecutiveEmptyBatches = 0

		// Обрабатываем подарки
		batchGifts := gs.processAllGiftsIncludingBasic(resp.Gifts, len(allGifts))

		log.Printf("Batch #%d: processed %d/%d gifts in %v (total: %d)",
			requestCount, len(batchGifts), len(resp.Gifts), requestDuration, len(allGifts)+len(batchGifts))

		allGifts = append(allGifts, batchGifts...)

		// Если получили меньше подарков чем лимит, значит это последний батч
		if len(resp.Gifts) < limit {
			log.Printf("Last batch detected (got %d < %d), finishing with %d gifts", len(resp.Gifts), limit, len(allGifts))
			break
		}

		// Обновляем offset
		if resp.NextOffset != "" {
			offset = resp.NextOffset
		} else {
			if len(resp.Gifts) > 0 {
				lastGift := resp.Gifts[len(resp.Gifts)-1]
				if lastGift.Gift != nil {
					switch gift := lastGift.Gift.(type) {
					case *tg.StarGift:
						offset = fmt.Sprintf("%d", gift.ID)
					case *tg.StarGiftUnique:
						offset = fmt.Sprintf("%d", gift.ID)
					default:
						offset = fmt.Sprintf("%d", len(allGifts))
					}
				} else {
					offset = fmt.Sprintf("%d", len(allGifts))
				}
			} else {
				offset = fmt.Sprintf("%d", len(allGifts))
			}
		}

		// Ограничиваем количество запросов
		if requestCount >= 100 {
			log.Printf("Max requests reached (%d), finishing with %d gifts", requestCount, len(allGifts))
			break
		}

		// Задержка между запросами
		select {
		case <-time.After(50 * time.Millisecond):
		case <-ctx.Done():
			return allGifts, nil
		}
	}

	log.Printf("COMPLETED: %d gifts in %d requests for user %d", len(allGifts), requestCount, user.ID)
	return allGifts, nil
}

func (gs *GiftsService) processAllGiftsIncludingBasic(gifts []tg.SavedStarGift, baseOffset int) []Gift {
	var processedGifts []Gift
	processedGifts = make([]Gift, 0, len(gifts))

	for i, g := range gifts {
		if g.Gift == nil {
			continue
		}

		var gift Gift

		switch starGift := g.Gift.(type) {
		case *tg.StarGift:
			gift = Gift{
				ID:   starGift.ID,
				Name: fmt.Sprintf("%s (Regular)", starGift.Title),
			}

		case *tg.StarGiftUnique:
			gift = Gift{
				ID:   starGift.ID,
				Name: fmt.Sprintf("%s #%d", starGift.Title, starGift.Num),
			}

			// Обрабатываем атрибуты
			for _, attr := range starGift.Attributes {
				switch a := attr.(type) {
				case *tg.StarGiftAttributeModel:
					gift.Model = a.Name
				case *tg.StarGiftAttributeBackdrop:
					gift.Backdrop = a.Name
				}
			}

		default:
			log.Printf("Unknown gift type: %T", starGift)
			continue
		}

		if gift.ID == 0 {
			gift.ID = int64(baseOffset + i)
		}
		processedGifts = append(processedGifts, gift)
	}

	log.Printf("Processed %d gifts (all types) out of %d total gifts", len(processedGifts), len(gifts))
	return processedGifts
}

func (gs *GiftsService) handleGetGifts(c *gin.Context) {
	var request GiftRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, GiftResponse{
			Success: false,
			Error:   "Invalid request format",
		})
		return
	}

	start := time.Now()

	// Сначала проверяем кеш по user_id
	if request.UserID > 0 {
		if gifts := gs.getCachedGiftsByUserID(request.UserID); gifts != nil {
			log.Printf("Cache HIT for user_id %d: %d gifts", request.UserID, len(gifts))
			// Специальная обработка для пустого кеша
			if len(gifts) == 0 {
				c.JSON(http.StatusOK, GiftResponse{
					Success:  true,
					Gifts:    []Gift{},
					Count:    0,
					Duration: time.Since(start).String(),
					Error:    "no_gifts_found",
				})
				return
			}

			c.JSON(http.StatusOK, GiftResponse{
				Success:  true,
				Gifts:    gifts,
				Count:    len(gifts),
				Duration: time.Since(start).String(),
			})
			return
		}
	}

	// Потом проверяем кеш по username (старый способ)
	if gifts := gs.getCachedGifts(request.Username); gifts != nil {
		log.Printf("Cache HIT for username %s: %d gifts", request.Username, len(gifts))
		// Специальная обработка для пустого кеша
		if len(gifts) == 0 {
			c.JSON(http.StatusOK, GiftResponse{
				Success:  true,
				Gifts:    []Gift{},
				Count:    0,
				Duration: time.Since(start).String(),
				Error:    "no_gifts_found",
			})
			return
		}

		c.JSON(http.StatusOK, GiftResponse{
			Success:  true,
			Gifts:    gifts,
			Count:    len(gifts),
			Duration: time.Since(start).String(),
		})
		return
	}

	log.Printf("Cache MISS for user %s (ID: %d) - fetching from Telegram API", request.Username, request.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	gifts, err := gs.GetUserGifts(ctx, request.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, GiftResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Кешируем результат по обоим ключам с увеличенным TTL
	ttl := 30 * time.Minute
	gs.setCachedGifts(request.Username, gifts, ttl)

	if request.UserID > 0 {
		gs.setCachedGiftsByUserID(request.UserID, request.Username, gifts, ttl)
	}

	// Специальная обработка для пустого результата
	if len(gifts) == 0 {
		log.Printf("No gifts found for user %s, returning empty response", request.Username)
		c.JSON(http.StatusOK, GiftResponse{
			Success:  true,
			Gifts:    []Gift{},
			Count:    0,
			Duration: time.Since(start).String(),
			Error:    "no_gifts_found",
		})
		return
	}

	c.JSON(http.StatusOK, GiftResponse{
		Success:  true,
		Gifts:    gifts,
		Count:    len(gifts),
		Duration: time.Since(start).String(),
	})
}

func (gs *GiftsService) getCachedGifts(username string) []Gift {
	gs.cacheMux.RLock()
	defer gs.cacheMux.RUnlock()

	entry, exists := gs.cache[username]
	if !exists || time.Since(entry.Timestamp) > entry.TTL {
		return nil
	}
	return entry.Data
}

func (gs *GiftsService) setCachedGifts(username string, gifts []Gift, ttl time.Duration) {
	gs.cacheMux.Lock()
	defer gs.cacheMux.Unlock()

	gs.cache[username] = CacheEntry{
		Data:      gifts,
		Timestamp: time.Now(),
		TTL:       ttl,
	}
}

func (gs *GiftsService) getCachedGiftsByUserID(userID int64) []Gift {
	gs.userCacheMux.RLock()
	defer gs.userCacheMux.RUnlock()

	entry, exists := gs.userCache[userID]
	if !exists || time.Since(entry.Timestamp) > entry.TTL {
		return nil
	}
	log.Printf("Cache HIT for user_id %d (%s): %d gifts", userID, entry.Username, len(entry.Gifts))
	return entry.Gifts
}

func (gs *GiftsService) setCachedGiftsByUserID(userID int64, username string, gifts []Gift, ttl time.Duration) {
	gs.userCacheMux.Lock()
	defer gs.userCacheMux.Unlock()

	gs.userCache[userID] = UserCacheEntry{
		Gifts:     gifts,
		Timestamp: time.Now(),
		TTL:       ttl,
		Username:  username,
	}
	log.Printf("Cache SET for user_id %d (%s): %d gifts, TTL: %v", userID, username, len(gifts), ttl)
}

// Очистка устаревшего кеша
func (gs *GiftsService) cleanupExpiredCache() {
	ticker := time.NewTicker(5 * time.Minute)
	go func() {
		for range ticker.C {
			now := time.Now()

			// Очистка username кеша
			gs.cacheMux.Lock()
			for key, entry := range gs.cache {
				if now.Sub(entry.Timestamp) > entry.TTL {
					delete(gs.cache, key)
				}
			}
			gs.cacheMux.Unlock()

			// Очистка user_id кеша
			gs.userCacheMux.Lock()
			for userID, entry := range gs.userCache {
				if now.Sub(entry.Timestamp) > entry.TTL {
					delete(gs.userCache, userID)
				}
			}
			gs.userCacheMux.Unlock()
		}
	}()
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func maskString(s string) string {
	if len(s) == 0 {
		return "NOT_SET"
	}
	if len(s) <= 4 {
		return "****"
	}
	return s[:2] + "***" + s[len(s)-2:]
}

func main() {
	// Устанавливаем режим Gin в release
	gin.SetMode(gin.ReleaseMode)

	service := NewGiftsService()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := service.Initialize(ctx); err != nil {
		log.Fatalf("Failed to initialize: %v", err)
	}

	// Запускаем очистку кеша
	service.cleanupExpiredCache()

	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.POST("/gifts", service.handleGetGifts)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "gifts"})
	})

	port := os.Getenv("GIFTS_SERVICE_PORT")
	if port == "" {
		port = "5002"
	}

	log.Printf("Gifts service starting on port %s", port)
	log.Fatal(r.Run(":" + port))
}
