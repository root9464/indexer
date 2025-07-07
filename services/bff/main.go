package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"runtime"
	"runtime/debug"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq" // PostgreSQL driver
)

// Circuit breaker для защиты от каскадных отказов
type CircuitBreaker struct {
	state       int32 // 0: closed, 1: open, 2: half-open
	failures    int64
	lastFailure time.Time
	threshold   int64
	timeout     time.Duration
}

func NewCircuitBreaker(threshold int64, timeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		threshold: threshold,
		timeout:   timeout,
	}
}

func (cb *CircuitBreaker) Call(fn func() error) error {
	state := atomic.LoadInt32(&cb.state)

	if state == 1 { // open
		if time.Since(cb.lastFailure) > cb.timeout {
			atomic.StoreInt32(&cb.state, 2) // half-open
		} else {
			return fmt.Errorf("circuit breaker is open")
		}
	}

	err := fn()
	if err != nil {
		cb.recordFailure()
		return err
	}

	cb.recordSuccess()
	return nil
}

func (cb *CircuitBreaker) recordFailure() {
	failures := atomic.AddInt64(&cb.failures, 1)
	cb.lastFailure = time.Now()

	if failures >= cb.threshold {
		atomic.StoreInt32(&cb.state, 1) // open
	}
}

func (cb *CircuitBreaker) recordSuccess() {
	atomic.StoreInt64(&cb.failures, 0)
	atomic.StoreInt32(&cb.state, 0) // closed
}

// Rate limiter для ограничения нагрузки
type RateLimiter struct {
	tokens chan struct{}
}

func NewRateLimiter(capacity int) *RateLimiter {
	rl := &RateLimiter{
		tokens: make(chan struct{}, capacity),
	}

	// Заполняем канал токенами
	for i := 0; i < capacity; i++ {
		rl.tokens <- struct{}{}
	}

	// Пополняем токены
	go func() {
		ticker := time.NewTicker(time.Millisecond * 10) // 100 RPS
		defer ticker.Stop()
		for range ticker.C {
			select {
			case rl.tokens <- struct{}{}:
			default:
			}
		}
	}()

	return rl
}

func (rl *RateLimiter) Allow() bool {
	select {
	case <-rl.tokens:
		return true
	default:
		return false
	}
}

type BFFService struct {
	authServiceURL  string
	giftsServiceURL string
	dataServiceURL  string
	botServiceURL   string
	logger          *log.Logger
	httpClient      *http.Client
	db              *sql.DB
	dbMutex         sync.RWMutex

	// Circuit breakers для каждого сервиса
	authCB  *CircuitBreaker
	giftsCB *CircuitBreaker
	dataCB  *CircuitBreaker
	botCB   *CircuitBreaker

	// Rate limiter
	rateLimiter *RateLimiter

	// Улучшенный кеш
	publicCache struct {
		marketcap       CacheEntry
		trends          CacheEntry
		floorPriceModel CacheEntry
		mutex           sync.RWMutex
	}

	// Статистика для мониторинга
	stats struct {
		requests    int64
		errors      int64
		cacheHits   int64
		cacheMisses int64
	}
}

type CacheEntry struct {
	Data      map[string]interface{}
	Timestamp time.Time
	TTL       time.Duration
}

type AuthResponse struct {
	Success   bool   `json:"success"`
	User      *User  `json:"user,omitempty"`
	Token     string `json:"token,omitempty"`
	Error     string `json:"error,omitempty"`
	ErrorCode string `json:"error_code,omitempty"`
}

type User struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name,omitempty"`
	Username  string `json:"username,omitempty"`
	PhotoURL  string `json:"photo_url,omitempty"`
}

type GiftResponse struct {
	Success  bool   `json:"success"`
	Gifts    []Gift `json:"gifts,omitempty"`
	Count    int    `json:"count"`
	Error    string `json:"error,omitempty"`
	Duration string `json:"duration,omitempty"`
}

type Gift struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Model      string `json:"model"`
	Backdrop   string `json:"backdrop"`
	Collection string `json:"collection"`
	GiftNum    string `json:"gift_num"`
}

type MetricRequest struct {
	UserID    int64                  `json:"user_id" binding:"required"`
	EventType string                 `json:"event_type" binding:"required"`
	EventData map[string]interface{} `json:"event_data,omitempty"`
	Page      string                 `json:"page" binding:"required"`
	SessionID string                 `json:"session_id,omitempty"`
	UserAgent string                 `json:"user_agent,omitempty"`
	IPAddress string                 `json:"ip_address,omitempty"`
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// Добавляем функцию для маскировки чувствительных данных
func maskString(s string) string {
	if len(s) == 0 {
		return "NOT_SET"
	}
	if len(s) <= 4 {
		return "****"
	}
	return s[:2] + "***" + s[len(s)-2:]
}

func init() {
	// Настройки для снижения потребления памяти
	debug.SetGCPercent(50)          // Более агрессивная сборка мусора
	debug.SetMemoryLimit(400 << 20) // Ограничиваем память до 400MB

	// Ограничиваем количество потоков ОС
	runtime.GOMAXPROCS(2)
}

func NewBFFService() *BFFService {
	// Настройки HTTP клиента из переменных окружения
	maxIdleConns := getEnvInt("MAX_IDLE_CONNS", 30)
	maxIdleConnsPerHost := getEnvInt("MAX_IDLE_CONNS_PER_HOST", 3)
	idleConnTimeout := getEnvDuration("IDLE_CONN_TIMEOUT", "30") * time.Second
	httpTimeout := getEnvDuration("HTTP_CLIENT_TIMEOUT", "10") * time.Second

	httpClient := &http.Client{
		Timeout: httpTimeout,
		Transport: &http.Transport{
			MaxIdleConns:          maxIdleConns,
			MaxIdleConnsPerHost:   maxIdleConnsPerHost,
			IdleConnTimeout:       idleConnTimeout,
			DisableKeepAlives:     false,
			MaxConnsPerHost:       5,
			ResponseHeaderTimeout: 5 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		},
	}

	// Circuit breaker настройки
	cbThreshold := getEnvInt64("CB_THRESHOLD", 5)
	cbTimeout := getEnvDuration("CB_TIMEOUT", "30") * time.Second

	// Rate limiter настройки
	rateLimitCapacity := getEnvInt("RATE_LIMIT_CAPACITY", 500)

	bff := &BFFService{
		authServiceURL:  getEnvOrDefault("AUTH_SERVICE_URL", "http://auth-service:5001"),
		giftsServiceURL: getEnvOrDefault("GIFTS_SERVICE_URL", "http://gifts-service:5002"),
		dataServiceURL:  getEnvOrDefault("DATA_SERVICE_URL", "http://data-service:5003"),
		botServiceURL:   getEnvOrDefault("BOT_SERVICE_URL", "http://bot-service:5004"),
		logger:          log.New(os.Stdout, "[BFF] ", log.LstdFlags),
		httpClient:      httpClient,

		// Инициализируем circuit breakers
		authCB:  NewCircuitBreaker(cbThreshold, cbTimeout),
		giftsCB: NewCircuitBreaker(cbThreshold, cbTimeout),
		dataCB:  NewCircuitBreaker(cbThreshold, cbTimeout),
		botCB:   NewCircuitBreaker(cbThreshold, cbTimeout),

		// Rate limiter
		rateLimiter: NewRateLimiter(rateLimitCapacity),
	}

	// Инициализируем пул соединений к БД
	if err := bff.initDB(); err != nil {
		log.Printf("❌ Failed to initialize database: %v", err)
	}

	// Запускаем очистку кеша чаще
	go bff.cleanupPublicCache()

	// Запускаем сборщик статистики
	go bff.statsCollector()

	return bff
}

// Инициализация пула соединений к БД
func (bff *BFFService) initDB() error {
	db, err := bff.createDBConnection()
	if err != nil {
		return err
	}

	// Еще более консервативные настройки
	db.SetMaxOpenConns(5)                   // Сократили с 10 до 5
	db.SetMaxIdleConns(2)                   // Сократили с 5 до 2
	db.SetConnMaxLifetime(2 * time.Minute)  // Сократили с 3 до 2 минут
	db.SetConnMaxIdleTime(20 * time.Second) // Сократили с 30 до 20 секунд

	bff.dbMutex.Lock()
	bff.db = db
	bff.dbMutex.Unlock()

	return nil
}

// Сборщик статистики
func (bff *BFFService) statsCollector() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		requests := atomic.LoadInt64(&bff.stats.requests)
		errors := atomic.LoadInt64(&bff.stats.errors)
		hits := atomic.LoadInt64(&bff.stats.cacheHits)
		misses := atomic.LoadInt64(&bff.stats.cacheMisses)

		errorRate := float64(0)
		if requests > 0 {
			errorRate = float64(errors) / float64(requests) * 100
		}

		cacheHitRate := float64(0)
		if hits+misses > 0 {
			cacheHitRate = float64(hits) / float64(hits+misses) * 100
		}

		log.Printf("📊 Stats: Requests=%d, Errors=%d (%.1f%%), Cache hits=%.1f%%",
			requests, errors, errorRate, cacheHitRate)
	}
}

// Rate limiting middleware
func (bff *BFFService) rateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !bff.rateLimiter.Allow() {
			atomic.AddInt64(&bff.stats.errors, 1)
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded",
				"code":  "RATE_LIMIT_EXCEEDED",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// Создание HTTP-запроса с контекстом и timeout (оригинальный метод)
func (bff *BFFService) makeHTTPRequest(ctx context.Context, method, url string, body []byte) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return bff.httpClient.Do(req)
}

// Создание HTTP-запроса с контекстом и circuit breaker
func (bff *BFFService) makeHTTPRequestWithCB(ctx context.Context, method, url string, body []byte, cb *CircuitBreaker) (*http.Response, error) {
	var resp *http.Response
	var err error

	err = cb.Call(func() error {
		req, reqErr := http.NewRequestWithContext(ctx, method, url, bytes.NewBuffer(body))
		if reqErr != nil {
			return reqErr
		}

		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		resp, err = bff.httpClient.Do(req)
		return err
	})

	return resp, err
}

func (bff *BFFService) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		atomic.AddInt64(&bff.stats.requests, 1)

		// Сократили timeout
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		initData := c.GetHeader("X-Telegram-Init-Data")
		if initData == "" {
			atomic.AddInt64(&bff.stats.errors, 1)
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "X-Telegram-Init-Data header required",
				"code":  "AUTH_REQUIRED",
			})
			c.Abort()
			return
		}

		authReq := map[string]string{"init_data": initData}
		jsonData, _ := json.Marshal(authReq)

		resp, err := bff.makeHTTPRequestWithCB(ctx, "POST", bff.authServiceURL+"/auth", jsonData, bff.authCB)
		if err != nil {
			atomic.AddInt64(&bff.stats.errors, 1)
			bff.logger.Printf("❌ Auth service error: %v", err)
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Auth service unavailable",
				"code":  "SERVICE_UNAVAILABLE",
			})
			c.Abort()
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			var authResp AuthResponse
			if json.Unmarshal(body, &authResp) == nil && authResp.Success && authResp.User != nil {
				log.Printf("✅ Auth successful for user %d (@%s)", authResp.User.ID, authResp.User.Username)

				// Сохраняем данные пользователя в контексте
				c.Set("user", authResp.User)
				c.Set("username", authResp.User.Username)
				c.Set("user_id", authResp.User.ID)
				c.Set("first_name", authResp.User.FirstName)
				c.Set("last_name", authResp.User.LastName)
				c.Set("photo_url", authResp.User.PhotoURL)
				c.Next()
				return
			}
		}

		atomic.AddInt64(&bff.stats.errors, 1)
		// Читаем ошибку от auth service
		body, _ := io.ReadAll(resp.Body)
		log.Printf("❌ Auth failed with status %d: %s", resp.StatusCode, string(body))

		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid or expired token",
			"code":  "TOKEN_INVALID",
		})
		c.Abort()
	}
}

func (bff *BFFService) handleAuth(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second) // Сократили с 15 до 10
	defer cancel()

	var authRequest struct {
		InitData string `json:"init_data" binding:"required"`
	}

	if err := c.ShouldBindJSON(&authRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"code":  "INVALID_REQUEST",
		})
		return
	}

	jsonData, _ := json.Marshal(authRequest)
	resp, err := bff.makeHTTPRequestWithCB(ctx, "POST", bff.authServiceURL+"/auth", jsonData, bff.authCB)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Auth service unavailable",
			"code":  "SERVICE_UNAVAILABLE",
		})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var authResp AuthResponse
	json.Unmarshal(body, &authResp)

	c.JSON(resp.StatusCode, authResp)
}

func (bff *BFFService) handleProcessGifts(c *gin.Context) {
	// Сократили timeout
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	userInterface, exists := c.Get("user")
	if !exists {
		log.Printf("❌ Process gifts failed: User not found in context")
		c.JSON(http.StatusBadRequest, gin.H{"error": "User not found in context"})
		return
	}

	user, ok := userInterface.(*User)
	if !ok {
		log.Printf("❌ Process gifts failed: Invalid user type in context")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user data"})
		return
	}

	log.Printf("🔄 Processing gifts for user %d (@%s)", user.ID, user.Username)

	// 1. Проверяем подписку с circuit breaker
	subscriptionReq := map[string]interface{}{"user_id": user.ID}
	jsonData, _ := json.Marshal(subscriptionReq)

	subscriptionResp, err := bff.makeHTTPRequestWithCB(ctx, "POST", bff.botServiceURL+"/check-subscription", jsonData, bff.botCB)
	if err != nil {
		log.Printf("❌ Bot service unavailable: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Subscription check failed - service unavailable"})
		return
	}
	defer subscriptionResp.Body.Close()

	subscriptionBody, _ := io.ReadAll(subscriptionResp.Body)
	var subscriptionResponse map[string]interface{}
	json.Unmarshal(subscriptionBody, &subscriptionResponse)

	isSubscribed, ok := subscriptionResponse["is_subscribed"].(bool)
	if !ok || !isSubscribed {
		log.Printf("❌ User %s is not subscribed to channel", user.Username)
		c.JSON(http.StatusForbidden, gin.H{
			"error":         "Subscription required",
			"code":          "SUBSCRIPTION_REQUIRED",
			"is_subscribed": false,
		})
		return
	}

	// 2. Получаем подарки с circuit breaker
	giftsReq := map[string]interface{}{
		"username":   user.Username,
		"user_id":    user.ID,
		"first_name": user.FirstName,
		"last_name":  user.LastName,
	}

	jsonData, _ = json.Marshal(giftsReq)
	giftsResp, err := bff.makeHTTPRequestWithCB(ctx, "POST", bff.giftsServiceURL+"/gifts", jsonData, bff.giftsCB)
	if err != nil {
		log.Printf("❌ Gifts service unavailable: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gifts service unavailable"})
		return
	}
	defer giftsResp.Body.Close()

	var giftResponse GiftResponse
	body, _ := io.ReadAll(giftsResp.Body)
	json.Unmarshal(body, &giftResponse)

	if !giftResponse.Success {
		log.Printf("❌ Gifts service error for user %s: %s", user.Username, giftResponse.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": giftResponse.Error})
		return
	}

	// 3. Обрабатываем результат с circuit breaker
	dataReq := map[string]interface{}{
		"username":   user.Username,
		"user_id":    user.ID,
		"first_name": user.FirstName,
		"gifts":      giftResponse.Gifts,
	}

	// Специальная обработка для случаев без подарков
	if len(giftResponse.Gifts) == 0 {
		log.Printf("⚠️ No gifts found for user %s - NOT sending to ClickHouse", user.Username)
		dataReq["gifts"] = []Gift{} // Пустой массив - data-service не будет обращаться к ClickHouse
	} else {
		log.Printf("✅ Got %d gifts for user %s - sending to ClickHouse for processing", len(giftResponse.Gifts), user.Username)
	}

	jsonData, _ = json.Marshal(dataReq)
	dataResp, err := bff.makeHTTPRequestWithCB(ctx, "POST", bff.dataServiceURL+"/process", jsonData, bff.dataCB)
	if err != nil {
		log.Printf("❌ Data service unavailable: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Data service unavailable"})
		return
	}
	defer dataResp.Body.Close()

	dataBody, _ := io.ReadAll(dataResp.Body)
	var result map[string]interface{}
	json.Unmarshal(dataBody, &result)

	if len(giftResponse.Gifts) == 0 {
		if giftResponse.Error == "privacy_restricted" {
			result["empty_reason"] = "privacy_restricted"
		} else {
			result["empty_reason"] = "no_gifts_found"
		}
		result["empty_portfolio"] = true
		result["username"] = user.Username
		log.Printf("✅ Empty portfolio processed for user %s - ClickHouse was NOT queried", user.Username)
	} else {
		log.Printf("✅ Data processing completed for user %s", user.Username)
	}

	c.JSON(dataResp.StatusCode, result)
}

func (bff *BFFService) handleGetGifts(c *gin.Context) {
	userInterface, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "User not found in context",
		})
		return
	}

	user, ok := userInterface.(*User)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid user data",
		})
		return
	}

	// Получаем подарки из gifts service с circuit breaker
	giftsReq := map[string]interface{}{
		"username": user.Username,
		"user_id":  user.ID,
	}

	jsonData, _ := json.Marshal(giftsReq)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	resp, err := bff.makeHTTPRequestWithCB(ctx, "POST", bff.giftsServiceURL+"/gifts", jsonData, bff.giftsCB)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Gifts service unavailable",
		})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var giftResponse map[string]interface{}
	json.Unmarshal(body, &giftResponse)

	c.JSON(resp.StatusCode, giftResponse)
}

func (bff *BFFService) handleCheckSubscription(c *gin.Context) {
	// Получаем данные пользователя из middleware
	userInterface, exists := c.Get("user")
	if !exists {
		log.Printf("❌ Check subscription failed: User not found in context")
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "User not found in context",
		})
		return
	}

	user, ok := userInterface.(*User)
	if !ok {
		log.Printf("❌ Check subscription failed: Invalid user type in context")
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid user data",
		})
		return
	}

	log.Printf("🔄 Checking subscription for user %d (@%s)", user.ID, user.Username)

	// Отправляем запрос с circuit breaker и сокращенным timeout
	subscriptionReq := map[string]interface{}{
		"user_id": user.ID,
	}

	jsonData, _ := json.Marshal(subscriptionReq)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	resp, err := bff.makeHTTPRequestWithCB(ctx, "POST", bff.botServiceURL+"/check-subscription", jsonData, bff.botCB)
	if err != nil {
		log.Printf("❌ Bot service unavailable: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Bot service unavailable",
		})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var subscriptionResponse map[string]interface{}
	json.Unmarshal(body, &subscriptionResponse)

	// Добавляем более детальную информацию об ошибке подписки
	if isSubscribed, ok := subscriptionResponse["is_subscribed"].(bool); ok && !isSubscribed {
		subscriptionResponse["error"] = "Subscription required"
		subscriptionResponse["error_code"] = "SUBSCRIPTION_REQUIRED"
	}

	log.Printf("✅ Subscription check completed for user %s: %v", user.Username, subscriptionResponse["is_subscribed"])
	c.JSON(resp.StatusCode, subscriptionResponse)
}

func (bff *BFFService) handleRecordMetric(c *gin.Context) {
	var req MetricRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		bff.logger.Printf("❌ Invalid metric request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	// Валидация
	if req.UserID <= 0 {
		bff.logger.Printf("❌ Invalid user_id in metric: %d", req.UserID)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user_id"})
		return
	}

	if req.EventType == "" {
		bff.logger.Printf("❌ Empty event_type in metric")
		c.JSON(http.StatusBadRequest, gin.H{"error": "event_type is required"})
		return
	}

	if req.Page == "" {
		bff.logger.Printf("❌ Empty page in metric")
		c.JSON(http.StatusBadRequest, gin.H{"error": "page is required"})
		return
	}

	// Добавляем метаданные
	if req.IPAddress == "" {
		req.IPAddress = c.ClientIP()
	}
	if req.UserAgent == "" {
		req.UserAgent = c.GetHeader("User-Agent")
	}

	// Немедленно отвечаем клиенту
	c.JSON(http.StatusOK, gin.H{
		"status":     "success",
		"message":    "Metric recorded",
		"event_type": req.EventType,
		"user_id":    req.UserID,
	})

	// Записываем асинхронно с сокращенным timeout
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		if err := bff.recordUserMetricWithContext(ctx, req.UserID, req.EventType, req.EventData, req.Page, req.SessionID, req.UserAgent, req.IPAddress); err != nil {
			bff.logger.Printf("❌ Error recording metric: %v", err)
		}
	}()
}

// Очистка устаревшего публичного кеша - чаще
func (bff *BFFService) cleanupPublicCache() {
	ticker := time.NewTicker(30 * time.Second) // Сократили с 1 минуты до 30 секунд
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		bff.publicCache.mutex.Lock()

		if now.Sub(bff.publicCache.marketcap.Timestamp) > bff.publicCache.marketcap.TTL {
			bff.publicCache.marketcap = CacheEntry{}
		}
		if now.Sub(bff.publicCache.trends.Timestamp) > bff.publicCache.trends.TTL {
			bff.publicCache.trends = CacheEntry{}
		}
		if now.Sub(bff.publicCache.floorPriceModel.Timestamp) > bff.publicCache.floorPriceModel.TTL {
			bff.publicCache.floorPriceModel = CacheEntry{}
		}

		bff.publicCache.mutex.Unlock()
	}
}

// Проверка кеша
func (bff *BFFService) getCachedData(cacheType string) (map[string]interface{}, bool) {
	bff.publicCache.mutex.RLock()
	defer bff.publicCache.mutex.RUnlock()

	var entry CacheEntry
	switch cacheType {
	case "marketcap":
		entry = bff.publicCache.marketcap
	case "trends":
		entry = bff.publicCache.trends
	case "floor_price_model":
		entry = bff.publicCache.floorPriceModel
	default:
		return nil, false
	}

	if time.Since(entry.Timestamp) > entry.TTL || entry.Data == nil {
		atomic.AddInt64(&bff.stats.cacheMisses, 1)
		return nil, false
	}

	atomic.AddInt64(&bff.stats.cacheHits, 1)
	return entry.Data, true
}

// Сохранение в кеш
func (bff *BFFService) setCachedData(cacheType string, data map[string]interface{}, ttl time.Duration) {
	bff.publicCache.mutex.Lock()
	defer bff.publicCache.mutex.Unlock()

	entry := CacheEntry{
		Data:      data,
		Timestamp: time.Now(),
		TTL:       ttl,
	}

	switch cacheType {
	case "marketcap":
		bff.publicCache.marketcap = entry
	case "trends":
		bff.publicCache.trends = entry
	case "floor_price_model":
		bff.publicCache.floorPriceModel = entry
	}

	log.Printf("📦 Cached %s data for %v", cacheType, ttl)
}

func (bff *BFFService) handleMarketCap(c *gin.Context) {
	// Проверяем кеш
	if cachedData, exists := bff.getCachedData("marketcap"); exists {
		c.JSON(http.StatusOK, cachedData)
		return
	}

	// Сократили timeout
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()

	resp, err := bff.makeHTTPRequestWithCB(ctx, "GET", bff.dataServiceURL+"/marketcap", nil, bff.dataCB)
	if err != nil {
		log.Printf("❌ Data service unavailable for marketcap: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Data service unavailable"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var marketCapResponse map[string]interface{}
	json.Unmarshal(body, &marketCapResponse)

	// Кешируем на время из переменных окружения
	cacheTTL := getEnvDuration("CACHE_MARKETCAP_TTL", "120") * time.Second
	bff.setCachedData("marketcap", marketCapResponse, cacheTTL)

	c.JSON(resp.StatusCode, marketCapResponse)
}

func (bff *BFFService) handleTrends(c *gin.Context) {
	// Проверяем кеш
	if cachedData, exists := bff.getCachedData("trends"); exists {
		c.JSON(http.StatusOK, cachedData)
		return
	}

	// Сократили timeout
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()

	resp, err := bff.makeHTTPRequestWithCB(ctx, "GET", bff.dataServiceURL+"/trends", nil, bff.dataCB)
	if err != nil {
		log.Printf("❌ Data service unavailable for trends: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Data service unavailable"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var trendsResponse map[string]interface{}
	json.Unmarshal(body, &trendsResponse)

	// Кешируем на 90 секунд (сократили с 2 минут)
	bff.setCachedData("trends", trendsResponse, 90*time.Second)

	c.JSON(resp.StatusCode, trendsResponse)
}

func (bff *BFFService) handleFloorPriceModel(c *gin.Context) {
	// Проверяем кеш
	if cachedData, exists := bff.getCachedData("floor_price_model"); exists {
		c.JSON(http.StatusOK, cachedData)
		return
	}

	// Сократили timeout
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()

	resp, err := bff.makeHTTPRequestWithCB(ctx, "GET", bff.dataServiceURL+"/floor_price_model", nil, bff.dataCB)
	if err != nil {
		log.Printf("❌ Data service unavailable for floor price model: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Data service unavailable"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var floorPriceModelResponse map[string]interface{}
	json.Unmarshal(body, &floorPriceModelResponse)

	// Кешируем на 3 минуты (сократили с 5)
	bff.setCachedData("floor_price_model", floorPriceModelResponse, 3*time.Minute)

	c.JSON(resp.StatusCode, floorPriceModelResponse)
}

// Оптимизированная запись метрики с контекстом
func (bff *BFFService) recordUserMetricWithContext(ctx context.Context, userID int64, eventType string, eventData map[string]interface{}, page, sessionID, userAgent, ipAddress string) error {
	bff.dbMutex.RLock()
	db := bff.db
	bff.dbMutex.RUnlock()

	if db == nil {
		return fmt.Errorf("database connection not available")
	}

	var eventDataJSON []byte
	if len(eventData) > 0 {
		var err error
		eventDataJSON, err = json.Marshal(eventData)
		if err != nil {
			return fmt.Errorf("failed to marshal event data: %v", err)
		}
	} else {
		eventDataJSON = []byte("{}")
	}

	query := `
		INSERT INTO user_metrics (user_id, event_type, event_data, page, session_id, user_agent, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`

	_, err := db.ExecContext(ctx, query, userID, eventType, string(eventDataJSON), page, sessionID, userAgent, ipAddress)
	if err != nil {
		return fmt.Errorf("failed to insert metric: %v", err)
	}

	return nil
}

// Создание соединения с БД (без пула)
func (bff *BFFService) createDBConnection() (*sql.DB, error) {
	dbHost := getEnvOrDefault("DB_HOST", "localhost")
	dbPort := getEnvOrDefault("DB_PORT", "5432")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")

	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName)

	return sql.Open("postgres", dsn)
}

func setupRoutes(r *gin.Engine, bff *BFFService) {
	// Добавляем rate limiting
	r.Use(bff.rateLimitMiddleware())

	// Public routes
	r.POST("/api/auth", bff.handleAuth)
	r.GET("/api/trends", bff.handleTrends)
	r.GET("/api/floor_price_model", bff.handleFloorPriceModel)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Protected routes
	protected := r.Group("/api")
	protected.Use(bff.authMiddleware())
	{
		protected.POST("/process-gifts", bff.handleProcessGifts)
		protected.GET("/get-gifts", bff.handleGetGifts)
		protected.POST("/check-subscription", bff.handleCheckSubscription)
		protected.POST("/metrics", bff.handleRecordMetric)
		protected.GET("/marketcap", bff.handleMarketCap) // Защищенный маршрут для marketcap
	}
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found")
	}

	// Принудительная сборка мусора при старте
	runtime.GC()

	bff := NewBFFService()

	// Настраиваем Gin для production
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// Только Recovery middleware
	r.Use(gin.Recovery())

	// Упрощенный CORS без лишних заголовков
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Telegram-Init-Data, X-Telegram-Username, X-Telegram-User-ID")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	setupRoutes(r, bff)

	port := getEnvOrDefault("BFF_PORT", "5000")

	log.Printf("BFF service starting on port %s", port)

	// Более агрессивные таймауты сервера
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  5 * time.Second,  // Сократили с 10 до 5
		WriteTimeout: 5 * time.Second,  // Сократили с 10 до 5
		IdleTimeout:  30 * time.Second, // Сократили с 60 до 30
	}

	log.Fatal(srv.ListenAndServe())
}

func getEnvInt(key string, defaultValue int) int {
	if valueStr := os.Getenv(key); valueStr != "" {
		if value, err := strconv.Atoi(valueStr); err == nil {
			return value
		}
	}
	return defaultValue
}

func getEnvInt64(key string, defaultValue int64) int64 {
	if valueStr := os.Getenv(key); valueStr != "" {
		if value, err := strconv.ParseInt(valueStr, 10, 64); err == nil {
			return value
		}
	}
	return defaultValue
}

func getEnvDuration(key, defaultValue string) time.Duration {
	valueStr := getEnvOrDefault(key, defaultValue)
	if value, err := strconv.Atoi(valueStr); err == nil {
		return time.Duration(value)
	}
	if defaultInt, err := strconv.Atoi(defaultValue); err == nil {
		return time.Duration(defaultInt)
	}
	return 60 // fallback
}
