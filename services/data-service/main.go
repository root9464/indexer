package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

// Структуры для data-service
type Gift struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Model    string `json:"model"`
	Backdrop string `json:"backdrop"`
}

type BackdropData struct {
	Name         string `json:"name"`
	BackdropID   int    `json:"backdropId"`
	CenterColor  int    `json:"centerColor"`
	EdgeColor    int    `json:"edgeColor"`
	PatternColor int    `json:"patternColor"`
	TextColor    int    `json:"textColor"`
	Hex          struct {
		CenterColor  string `json:"centerColor"`
		EdgeColor    string `json:"edgeColor"`
		PatternColor string `json:"patternColor"`
		TextColor    string `json:"textColor"`
	} `json:"hex"`
}

type TONPrice struct {
	Symbol string `json:"symbol"`
	Price  string `json:"price"`
}

type DataService struct {
	tonPriceCache struct {
		price     float64
		timestamp time.Time
		mutex     sync.RWMutex
	}
	backdropCache struct {
		data      []BackdropData
		timestamp time.Time
		ttl       time.Duration
		mutex     sync.RWMutex
	}
	resultsCache struct {
		data  map[int64]ResultsCacheEntry
		mutex sync.RWMutex
	}
	// Добавляем кеш для публичных данных
	marketcapCache struct {
		data      []MarketCapData
		timestamp time.Time
		ttl       time.Duration
		mutex     sync.RWMutex
	}
	trendsCache struct {
		data      []HotDealData
		timestamp time.Time
		ttl       time.Duration
		mutex     sync.RWMutex
	}
	floorPriceCache struct {
		data      []ModelFloorPriceData
		timestamp time.Time
		ttl       time.Duration
		mutex     sync.RWMutex
	}
}

type CHConfig struct {
	Host     string `json:"host"`
	User     string `json:"user"`
	Password string `json:"password"`
	Port     int    `json:"port"`
}

type ResultsCacheEntry struct {
	Results   []GiftResult
	Timestamp time.Time
	TTL       time.Duration
	Username  string
}

type ProcessRequest struct {
	Username string `json:"username" binding:"required"`
	UserID   int64  `json:"user_id"`
	Gifts    []Gift `json:"gifts" binding:"required"`
}

type ProcessResponse struct {
	Success   bool           `json:"success"`
	Count     int            `json:"count"`
	Results   []GiftResult   `json:"results"`
	Username  string         `json:"username"`
	TONPrice  float64        `json:"ton_price"`
	Backdrops []BackdropData `json:"backdrops"`
	Error     string         `json:"error,omitempty"`
	Duration  string         `json:"duration,omitempty"`
}

type GiftResult struct {
	GiftID       uint64        `json:"gift_id"`
	GiftNum      string        `json:"gift_num"`
	Collection   string        `json:"collection"`
	Model        string        `json:"model_value"`
	Backdrop     string        `json:"backdrop_value"`
	BackdropInfo *BackdropData `json:"backdrop,omitempty"`
	Date         time.Time     `json:"dt"`
	MedianPrice  float64       `json:"median_price"`
	GiftCount    uint64        `json:"gift_count"`
	TotalBalance float64       `json:"total_balance"`
	PNG          string        `json:"png"`
	PerDayChange float64       `json:"per_day_change"`
}

type MarketCapData struct {
	CollectionID string    `json:"collection_id"`
	Slug         string    `json:"slug"`
	Date         time.Time `json:"dt"`

	// Основные метрики
	GiftsCount uint32  `json:"gifts_count"`
	Purchases  uint32  `json:"purchases"`
	Turnover   float64 `json:"turnover"`

	// Цены
	AvgPrice      float32 `json:"avg_price"`
	MedianPrice   float32 `json:"median_price"`
	MovingMedian3 float32 `json:"moving_median_3_days"`
	FloorPrice    float64 `json:"floor_price"`

	// Капитализация
	McapMedian       float64 `json:"mcap_median"`
	McapAvg          float64 `json:"mcap_avg"`
	MovingMcapMedian float64 `json:"moving_mcap_median"`
	McapFloor        float64 `json:"mcap_floor"`

	// Изменения за 1 день
	PrevDayGiftsCount        *uint32  `json:"prev_day_gifts_count"`
	PrevDayPurchases         *uint32  `json:"prev_day_purchases"`
	PrevDayTurnover          *float64 `json:"prev_day_turnover"`
	PrevDayAvgPrice          *float32 `json:"prev_day_avg_price"`
	PrevDayMedianPrice       *float32 `json:"prev_day_median_price"`
	PrevDayMovingMedianPrice *float32 `json:"prev_day_moving_median_price"`
	PrevDayMcapMedian        *float64 `json:"prev_day_mcap_median"`
	PrevDayMcapFloor         *float64 `json:"prev_day_mcap_floor"`
	PrevDayMovingMcapMedian  *float64 `json:"prev_day_moving_mcap_median"`
	PrevDayFloorPrice        *float64 `json:"prev_day_floor_price"`

	PNG string `json:"png"`
}

type MarketCapResponse struct {
	Success  bool            `json:"success"`
	Count    int             `json:"count"`
	Data     []MarketCapData `json:"data"`
	TONPrice float64         `json:"ton_price"`
	Error    string          `json:"error,omitempty"`
}

type HotDealData struct {
	CollectionID string    `json:"collection_id"`
	Collection   string    `json:"collection"`
	Slug         string    `json:"slug"`
	ModelValue   string    `json:"model_value"`
	ModelMark    string    `json:"model_mark"` // проценты в тексте со знаком
	Purchases    uint32    `json:"purchases"`
	Volume       float64   `json:"volume"`
	Timeframe    string    `json:"timeframe"`
	UpdatedAt    time.Time `json:"updated_at"`
	PNG          string    `json:"png,omitempty"`
}

type ModelFloorPriceData struct {
	CollectionID string    `json:"collection_id"`
	Collection   string    `json:"collection"`
	ModelValue   string    `json:"model_value"`
	Slug         string    `json:"slug"`
	FloorPrice   float64   `json:"floor_price"`
	Date         time.Time `json:"dt"`
	PNG          string    `json:"png,omitempty"`
}

type HotDealsResponse struct {
	Success  bool          `json:"success"`
	Count    int           `json:"count"`
	Data     []HotDealData `json:"data"`
	TONPrice float64       `json:"ton_price"`
	Error    string        `json:"error,omitempty"`
}

type ModelFloorPriceResponse struct {
	Success  bool                  `json:"success"`
	Count    int                   `json:"count"`
	Data     []ModelFloorPriceData `json:"data"`
	TONPrice float64               `json:"ton_price"`
	Error    string                `json:"error,omitempty"`
}

func NewDataService() *DataService {
	ds := &DataService{}
	ds.backdropCache.ttl = getEnvDuration("BACKDROP_CACHE_TTL", "1800") * time.Second
	ds.resultsCache.data = make(map[int64]ResultsCacheEntry)

	// Инициализируем кеш для публичных данных
	ds.marketcapCache.ttl = getEnvDuration("MARKETCAP_CACHE_TTL", "120") * time.Second
	ds.trendsCache.ttl = getEnvDuration("TRENDS_CACHE_TTL", "90") * time.Second
	ds.floorPriceCache.ttl = getEnvDuration("FLOOR_PRICE_CACHE_TTL", "180") * time.Second

	// Запускаем очистку кешей
	go ds.cleanupResultsCache()
	go ds.cleanupPublicDataCache()

	return ds
}

func (ds *DataService) getTONPrice() (float64, error) {
	// Проверяем кэш
	cacheTTL := getEnvDuration("TON_PRICE_CACHE_TTL", "60") * time.Second
	ds.tonPriceCache.mutex.RLock()
	if time.Since(ds.tonPriceCache.timestamp) < cacheTTL && ds.tonPriceCache.price > 0 {
		price := ds.tonPriceCache.price
		ds.tonPriceCache.mutex.RUnlock()
		return price, nil
	}
	ds.tonPriceCache.mutex.RUnlock()

	// Получаем актуальный курс
	apiURL := getEnvOrDefault("BINANCE_API_URL", "https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return 3.0, fmt.Errorf("failed to fetch TON price: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 3.0, fmt.Errorf("binance API returned status %d", resp.StatusCode)
	}

	var tonPrice TONPrice
	if err := json.NewDecoder(resp.Body).Decode(&tonPrice); err != nil {
		return 3.0, fmt.Errorf("failed to decode TON price: %w", err)
	}

	price, err := strconv.ParseFloat(tonPrice.Price, 64)
	if err != nil {
		return 3.0, fmt.Errorf("failed to parse TON price: %w", err)
	}

	// Кэшируем на 1 минуту
	ds.tonPriceCache.mutex.Lock()
	ds.tonPriceCache.price = price
	ds.tonPriceCache.timestamp = time.Now()
	ds.tonPriceCache.mutex.Unlock()

	log.Printf("Updated TON price: $%.4f", price)
	return price, nil
}

func (ds *DataService) getBackdrops() ([]BackdropData, error) {
	// Проверяем кэш
	cacheTTL := getEnvDuration("BACKDROP_CACHE_TTL", "1800") * time.Second
	ds.backdropCache.mutex.RLock()
	if time.Since(ds.backdropCache.timestamp) < cacheTTL && len(ds.backdropCache.data) > 0 {
		data := make([]BackdropData, len(ds.backdropCache.data))
		copy(data, ds.backdropCache.data)
		ds.backdropCache.mutex.RUnlock()
		return data, nil
	}
	ds.backdropCache.mutex.RUnlock()

	// Получаем актуальные данные
	apiURL := getEnvOrDefault("BACKDROPS_API_URL", "https://cdn.changes.tg/gifts/backdrops.json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch backdrops: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("backdrops API returned status %d", resp.StatusCode)
	}

	var backdrops []BackdropData
	if err := json.NewDecoder(resp.Body).Decode(&backdrops); err != nil {
		return nil, fmt.Errorf("failed to decode backdrops: %w", err)
	}

	// Кэшируем данные
	ds.backdropCache.mutex.Lock()
	ds.backdropCache.data = backdrops
	ds.backdropCache.timestamp = time.Now()
	ds.backdropCache.mutex.Unlock()

	log.Printf("Updated backdrops cache: %d backdrops", len(backdrops))
	return backdrops, nil
}

func (ds *DataService) processGiftsWithClickHouse(username string, gifts []Gift) ([]GiftResult, error) {
	log.Printf("Processing %d gifts with ClickHouse for username: @%s", len(gifts), username)

	if len(gifts) == 0 {
		log.Printf("No gifts found for username @%s - skipping ClickHouse processing", username)
		return []GiftResult{}, nil
	}

	// Получаем backdrops для PNG URL
	backdrops, err := ds.getBackdrops()
	if err != nil {
		log.Printf("Warning: failed to get backdrops, using fallback URLs: %v", err)
		backdrops = []BackdropData{} // пустой массив как fallback
	}

	// Создаем мапу для быстрого поиска backdrop по имени
	backdropByName := make(map[string]*BackdropData)
	for i := range backdrops {
		backdropByName[backdrops[i].Name] = &backdrops[i]
	}

	// Подключаемся к ClickHouse
	config := CHConfig{
		Host:     getEnvOrDefault("CH_HOST", "localhost"),
		User:     getEnvOrDefault("CH_USER", "default"),
		Password: getEnvOrDefault("CH_PASSWORD", ""),
		Port:     9440,
	}

	conn, err := getCHClient(config)
	if err != nil {
		return nil, fmt.Errorf("ошибка подключения к ClickHouse: %v", err)
	}
	defer conn.Close()

	var results []GiftResult

	// Увеличиваем размер батча для лучшей производительности
	batchSize := 1000
	for i := 0; i < len(gifts); i += batchSize {
		end := i + batchSize
		if end > len(gifts) {
			end = len(gifts)
		}
		batch := gifts[i:end]

		batchResults, err := ds.processBatchWithClickHouse(conn, batch, backdropByName)
		if err != nil {
			log.Printf("Error processing batch %d-%d: %v", i, end, err)
			continue
		}
		results = append(results, batchResults...)
	}

	return results, nil
}

func (ds *DataService) processBatchWithClickHouse(conn clickhouse.Conn, gifts []Gift, backdropByName map[string]*BackdropData) ([]GiftResult, error) {
	if len(gifts) == 0 {
		return []GiftResult{}, nil
	}

	// Упрощаем генерацию JSON - убираем лишние операции
	var jsonParts strings.Builder
	jsonParts.WriteByte('[')
	for i, gift := range gifts {
		if i > 0 {
			jsonParts.WriteByte(',')
		}
		// Используем более простое форматирование без лишних замен
		fmt.Fprintf(&jsonParts, `{"id":%d,"name":"%s","model":"%s","backdrop":"%s"}`,
			gift.ID,
			gift.Name, // убираем замены - ClickHouse сам справится
			gift.Model,
			gift.Backdrop)
	}
	jsonParts.WriteByte(']')

	// Обновленный запрос с правильным порядком полей
	query := fmt.Sprintf(`
		WITH parsed_json AS (
			SELECT
				arrayJoin(JSONExtractArrayRaw('%s')) AS raw,
				JSONExtractUInt(raw, 'id') AS gift_id,
				JSONExtractString(raw, 'name') AS gift_name,
				JSONExtractString(raw, 'model') AS model_value,
				JSONExtractString(raw, 'backdrop') AS backdrop_value,
				splitByString(' #', gift_name)[1] as collection,
				replaceAll(replaceAll(replaceAll(splitByString(' #', gift_name)[1], ' ', ''), '-', ''), '\'', '') as slug,
				splitByString(' #', gift_name)[2] as gift_num
		),
		base AS (
			SELECT
				pj.collection as collection,
				pj.model_value as model_value,
				pj.backdrop_value as backdrop_value,
				tm.dt as dt,
				round(sum(tm.price), 2) as balance,
				count() as gift_count
			FROM
				parsed_json as pj
			LEFT JOIN
				gifts.gifts_price_v2 as tm
				USING (collection, model_value, backdrop_value)
			GROUP BY
				dt,
				pj.collection,
				pj.model_value,
				pj.backdrop_value
			ORDER BY dt
		)
		SELECT
			collection,
			model_value,
			backdrop_value,
			dt,
			balance,
			gift_count,
			round(sum(gift_count) OVER(PARTITION BY dt), 2) as total_gift_count,
			round(sum(balance) OVER(PARTITION BY dt), 2) as total_balance
		FROM base
		ORDER BY dt, collection
	`, jsonParts.String())

	log.Printf("Executing optimized batch query for %d gifts", len(gifts))
	start := time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rows, err := conn.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("ошибка выполнения оптимизированного батч-запроса: %v", err)
	}
	defer rows.Close()

	// Предварительно выделяем память для результатов
	results := make([]GiftResult, 0, len(gifts))
	for rows.Next() {
		var collection string
		var modelValue string
		var backdropValue string
		var date time.Time
		var balance float64
		var giftCount uint64
		var totalGiftCount uint64
		var totalBalance float64

		if err := rows.Scan(&collection, &modelValue, &backdropValue, &date, &balance, &giftCount, &totalGiftCount, &totalBalance); err != nil {
			log.Printf("Ошибка сканирования строки: %v", err)
			continue
		}

		// Находим соответствующие подарки для этой коллекции, модели и фона
		for _, gift := range gifts {
			// Извлекаем коллекцию из имени подарка
			giftCollection := ""
			if strings.Contains(gift.Name, " #") {
				parts := strings.Split(gift.Name, " #")
				if len(parts) > 0 {
					giftCollection = parts[0]
				}
			}

			// Если коллекция, модель и фон совпадают, создаем результат
			if giftCollection == collection && gift.Model == modelValue && gift.Backdrop == backdropValue {
				// Извлекаем номер подарка
				giftNum := ""
				if strings.Contains(gift.Name, " #") {
					parts := strings.Split(gift.Name, " #")
					if len(parts) > 1 {
						giftNum = parts[1]
					}
				}

				// Формируем PNG URL на основе коллекции и атрибутов
				var pngURL string
				if gift.Model != "" {
					// Используем модель если есть
					pngURL = fmt.Sprintf("https://storage.yandexcloud.net/giftstat-cdn/%s/png/%s.png",
						strings.ReplaceAll(giftCollection, " ", "%20"),
						gift.Model)
				} else if gift.Backdrop != "" {
					// Fallback к старой схеме
					pngURL = fmt.Sprintf("https://storage.yandexcloud.net/giftstat-cdn/%s/png/%s.png",
						strings.ReplaceAll(giftCollection, " ", "%20"),
						gift.Backdrop)
				} else {
					// Fallback к номеру подарка
					pngURL = fmt.Sprintf("https://storage.yandexcloud.net/giftstat-cdn/%s/png/%s.png",
						strings.ReplaceAll(giftCollection, " ", "%20"),
						giftNum)
				}

				// Ищем полную информацию о backdrop
				var backdropInfo *BackdropData
				if gift.Backdrop != "" {
					if bd, exists := backdropByName[gift.Backdrop]; exists {
						backdropInfo = bd
					}
				}

				result := GiftResult{
					GiftID:       uint64(gift.ID),
					GiftNum:      giftNum,
					Collection:   collection,
					Model:        gift.Model,
					Backdrop:     gift.Backdrop,
					BackdropInfo: backdropInfo,
					Date:         date,
					MedianPrice:  balance,
					GiftCount:    totalGiftCount,
					TotalBalance: totalBalance,
					PNG:          pngURL,
				}
				results = append(results, result)
			}
		}
	}

	duration := time.Since(start)
	log.Printf("Optimized batch query completed: %d gifts -> %d results in %v", len(gifts), len(results), duration)

	// Вычисляем процентные изменения за день
	results = calculatePerDayChanges(results)

	return results, nil
}

// Функция для вычисления процентного изменения за день
func calculatePerDayChanges(results []GiftResult) []GiftResult {
	// Группируем результаты по уникальному ключу (gift_id + model + backdrop)
	resultsByKey := make(map[string][]GiftResult)

	for _, result := range results {
		key := fmt.Sprintf("%d_%s_%s", result.GiftID, result.Model, result.Backdrop)
		resultsByKey[key] = append(resultsByKey[key], result)
	}

	// Для каждой группы вычисляем изменения только для последних записей
	for key, group := range resultsByKey {
		if len(group) < 2 {
			// Если только одна запись, изменение = 0
			continue
		}

		// Сортируем по дате (от старых к новым)
		for i := 0; i < len(group)-1; i++ {
			for j := i + 1; j < len(group); j++ {
				if group[i].Date.After(group[j].Date) {
					group[i], group[j] = group[j], group[i]
				}
			}
		}

		// Берем только две последние записи для вычисления изменения за день
		if len(group) >= 2 {
			// Последняя запись (самая свежая)
			lastIndex := len(group) - 1
			current := group[lastIndex].MedianPrice

			// Предпоследняя запись
			previous := group[lastIndex-1].MedianPrice

			if previous > 0 {
				change := ((current - previous) / previous) * 100
				group[lastIndex].PerDayChange = math.Round(change*100) / 100 // округляем до 2 знаков
			}
		}

		resultsByKey[key] = group
	}

	// Собираем результаты обратно
	var updatedResults []GiftResult
	for _, group := range resultsByKey {
		updatedResults = append(updatedResults, group...)
	}

	return updatedResults
}

func getCHClient(config CHConfig) (clickhouse.Conn, error) {
	options := &clickhouse.Options{
		Addr: []string{fmt.Sprintf("%s:%d", config.Host, config.Port)},
		Auth: clickhouse.Auth{
			Database: "default",
			Username: config.User,
			Password: config.Password,
		},
	}

	// Для безопасного подключения к Yandex Cloud ClickHouse
	if config.Port == 9440 {
		options.TLS = &tls.Config{
			InsecureSkipVerify: true, // Пропускаем проверку сертификата для Yandex Cloud
		}
	}

	conn, err := clickhouse.Open(options)
	if err != nil {
		return nil, err
	}
	return conn, nil
}

func (ds *DataService) getCachedResults(userID int64) []GiftResult {
	ds.resultsCache.mutex.RLock()
	defer ds.resultsCache.mutex.RUnlock()

	entry, exists := ds.resultsCache.data[userID]
	if !exists || time.Since(entry.Timestamp) > entry.TTL {
		return nil
	}

	log.Printf("Results cache HIT for user_id %d (%s): %d results", userID, entry.Username, len(entry.Results))
	return entry.Results
}

func (ds *DataService) setCachedResults(userID int64, username string, results []GiftResult, ttl time.Duration) {
	ds.resultsCache.mutex.Lock()
	defer ds.resultsCache.mutex.Unlock()

	ds.resultsCache.data[userID] = ResultsCacheEntry{
		Results:   results,
		Timestamp: time.Now(),
		TTL:       ttl,
		Username:  username,
	}
	log.Printf("Results cache SET for user_id %d (%s): %d results, TTL: %v", userID, username, len(results), ttl)
}

func (ds *DataService) cleanupResultsCache() {
	ticker := time.NewTicker(10 * time.Minute)
	for range ticker.C {
		ds.resultsCache.mutex.Lock()
		now := time.Now()
		for userID, entry := range ds.resultsCache.data {
			if now.Sub(entry.Timestamp) > entry.TTL {
				delete(ds.resultsCache.data, userID)
			}
		}
		ds.resultsCache.mutex.Unlock()
	}
}

// Очистка кешей публичных данных
func (ds *DataService) cleanupPublicDataCache() {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		now := time.Now()

		// Очистка marketcap кеша
		ds.marketcapCache.mutex.Lock()
		if now.Sub(ds.marketcapCache.timestamp) > ds.marketcapCache.ttl {
			ds.marketcapCache.data = nil
		}
		ds.marketcapCache.mutex.Unlock()

		// Очистка trends кеша
		ds.trendsCache.mutex.Lock()
		if now.Sub(ds.trendsCache.timestamp) > ds.trendsCache.ttl {
			ds.trendsCache.data = nil
		}
		ds.trendsCache.mutex.Unlock()

		// Очистка floor price кеша
		ds.floorPriceCache.mutex.Lock()
		if now.Sub(ds.floorPriceCache.timestamp) > ds.floorPriceCache.ttl {
			ds.floorPriceCache.data = nil
		}
		ds.floorPriceCache.mutex.Unlock()
	}
}

func (ds *DataService) handleProcessGifts(c *gin.Context) {
	var request ProcessRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, ProcessResponse{
			Success: false,
			Error:   "Invalid request format",
		})
		return
	}

	start := time.Now()

	// Проверяем кеш результатов по user_id
	if request.UserID > 0 {
		if cachedResults := ds.getCachedResults(request.UserID); cachedResults != nil {
			tonPrice, _ := ds.getTONPrice()
			backdrops, _ := ds.getBackdrops()

			// Специальная обработка для пустого кеша
			if len(cachedResults) == 0 {
				c.JSON(http.StatusOK, ProcessResponse{
					Success:   true,
					Count:     0,
					Results:   []GiftResult{},
					Username:  request.Username,
					TONPrice:  tonPrice,
					Backdrops: backdrops,
					Duration:  time.Since(start).String(),
					Error:     "no_gifts_to_process",
				})
				return
			}

			c.JSON(http.StatusOK, ProcessResponse{
				Success:   true,
				Count:     len(cachedResults),
				Results:   cachedResults,
				Username:  request.Username,
				TONPrice:  tonPrice,
				Backdrops: backdrops,
				Duration:  time.Since(start).String(),
			})
			return
		}
	}

	// Получаем курс TON и backdrops
	tonPrice, err := ds.getTONPrice()
	if err != nil {
		log.Printf("Warning: failed to get TON price: %v", err)
		tonPrice = 3.0 // fallback
	}

	backdrops, err := ds.getBackdrops()
	if err != nil {
		log.Printf("Warning: failed to get backdrops: %v", err)
		backdrops = []BackdropData{}
	}

	// РАННЯЯ проверка для пустого списка подарков - НЕ отправляем в ClickHouse
	if len(request.Gifts) == 0 {
		log.Printf("Empty gifts list for user %s - skipping ClickHouse processing", request.Username)

		// Кешируем пустой результат если есть user_id
		if request.UserID > 0 {
			ds.setCachedResults(request.UserID, request.Username, []GiftResult{}, 5*time.Minute)
		}

		response := ProcessResponse{
			Success:   true,
			Count:     0,
			Results:   []GiftResult{},
			Username:  request.Username,
			TONPrice:  tonPrice,
			Backdrops: backdrops,
			Duration:  time.Since(start).String(),
			Error:     "no_gifts_to_process",
		}

		c.JSON(http.StatusOK, response)
		return
	}

	// Обрабатываем подарки с реальной ClickHouse интеграцией ТОЛЬКО если есть подарки
	log.Printf("Processing %d gifts with ClickHouse for user %s", len(request.Gifts), request.Username)
	results, err := ds.processGiftsWithClickHouse(request.Username, request.Gifts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ProcessResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Кешируем результаты если есть user_id
	if request.UserID > 0 && len(results) > 0 {
		ds.setCachedResults(request.UserID, request.Username, results, 5*time.Minute)
	}

	c.JSON(http.StatusOK, ProcessResponse{
		Success:   true,
		Count:     len(results),
		Results:   results,
		Username:  request.Username,
		TONPrice:  tonPrice,
		Backdrops: backdrops,
		Duration:  time.Since(start).String(),
	})
}

func (ds *DataService) handleMarketCap(c *gin.Context) {
	// Проверяем кеш
	ds.marketcapCache.mutex.RLock()
	if time.Since(ds.marketcapCache.timestamp) < ds.marketcapCache.ttl && ds.marketcapCache.data != nil {
		data := ds.marketcapCache.data
		ds.marketcapCache.mutex.RUnlock()

		tonPrice, _ := ds.getTONPrice()
		log.Printf("📦 MarketCap cache HIT: %d records", len(data))

		c.JSON(http.StatusOK, MarketCapResponse{
			Success:  true,
			Count:    len(data),
			Data:     data,
			TONPrice: tonPrice,
		})
		return
	}
	ds.marketcapCache.mutex.RUnlock()

	start := time.Now()
	log.Printf("📊 MarketCap cache MISS - querying ClickHouse")

	// Получаем курс TON
	tonPrice, err := ds.getTONPrice()
	if err != nil {
		log.Printf("Warning: failed to get TON price for marketcap: %v", err)
		tonPrice = 3.0 // fallback
	}

	data, err := ds.getMarketCapData()
	if err != nil {
		c.JSON(http.StatusInternalServerError, MarketCapResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Кешируем результат
	ds.marketcapCache.mutex.Lock()
	ds.marketcapCache.data = data
	ds.marketcapCache.timestamp = time.Now()
	ds.marketcapCache.mutex.Unlock()

	log.Printf("✅ MarketCap query completed and cached: %d records in %v", len(data), time.Since(start))

	c.JSON(http.StatusOK, MarketCapResponse{
		Success:  true,
		Count:    len(data),
		Data:     data,
		TONPrice: tonPrice,
	})
}

func (ds *DataService) handleTrends(c *gin.Context) {
	// Проверяем кеш
	ds.trendsCache.mutex.RLock()
	if time.Since(ds.trendsCache.timestamp) < ds.trendsCache.ttl && ds.trendsCache.data != nil {
		data := ds.trendsCache.data
		ds.trendsCache.mutex.RUnlock()

		tonPrice, _ := ds.getTONPrice()
		log.Printf("📦 Trends cache HIT: %d records", len(data))

		c.JSON(http.StatusOK, HotDealsResponse{
			Success:  true,
			Count:    len(data),
			Data:     data,
			TONPrice: tonPrice,
		})
		return
	}
	ds.trendsCache.mutex.RUnlock()

	start := time.Now()
	log.Printf("📊 Trends cache MISS - querying ClickHouse")

	// Получаем курс TON
	tonPrice, err := ds.getTONPrice()
	if err != nil {
		log.Printf("Warning: failed to get TON price for trends: %v", err)
		tonPrice = 3.0 // fallback
	}

	data, err := ds.getHotDealsData()
	if err != nil {
		c.JSON(http.StatusInternalServerError, HotDealsResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Кешируем результат
	ds.trendsCache.mutex.Lock()
	ds.trendsCache.data = data
	ds.trendsCache.timestamp = time.Now()
	ds.trendsCache.mutex.Unlock()

	log.Printf("✅ Trends query completed and cached: %d records in %v", len(data), time.Since(start))

	c.JSON(http.StatusOK, HotDealsResponse{
		Success:  true,
		Count:    len(data),
		Data:     data,
		TONPrice: tonPrice,
	})
}

func (ds *DataService) handleModelFloorPrices(c *gin.Context) {
	// Проверяем кеш
	ds.floorPriceCache.mutex.RLock()
	if time.Since(ds.floorPriceCache.timestamp) < ds.floorPriceCache.ttl && ds.floorPriceCache.data != nil {
		data := ds.floorPriceCache.data
		ds.floorPriceCache.mutex.RUnlock()

		tonPrice, _ := ds.getTONPrice()
		log.Printf("📦 Floor price cache HIT: %d records", len(data))

		c.JSON(http.StatusOK, ModelFloorPriceResponse{
			Success:  true,
			Count:    len(data),
			Data:     data,
			TONPrice: tonPrice,
		})
		return
	}
	ds.floorPriceCache.mutex.RUnlock()

	start := time.Now()
	log.Printf("📊 Floor price cache MISS - querying ClickHouse")

	// Получаем курс TON
	tonPrice, err := ds.getTONPrice()
	if err != nil {
		log.Printf("Warning: failed to get TON price for model floor prices: %v", err)
		tonPrice = 3.0 // fallback
	}

	data, err := ds.getModelFloorPriceData()
	if err != nil {
		c.JSON(http.StatusInternalServerError, ModelFloorPriceResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Кешируем результат
	ds.floorPriceCache.mutex.Lock()
	ds.floorPriceCache.data = data
	ds.floorPriceCache.timestamp = time.Now()
	ds.floorPriceCache.mutex.Unlock()

	log.Printf("✅ Model floor prices query completed and cached: %d records in %v", len(data), time.Since(start))

	c.JSON(http.StatusOK, ModelFloorPriceResponse{
		Success:  true,
		Count:    len(data),
		Data:     data,
		TONPrice: tonPrice,
	})
}

func (ds *DataService) getHotDealsData() ([]HotDealData, error) {
	config := CHConfig{
		Host:     getEnvOrDefault("CH_HOST", "localhost"),
		User:     getEnvOrDefault("CH_USER", "default"),
		Password: getEnvOrDefault("CH_PASSWORD", ""),
		Port:     9440,
	}

	conn, err := getCHClient(config)
	if err != nil {
		return nil, fmt.Errorf("ошибка подключения к ClickHouse: %v", err)
	}
	defer conn.Close()

	query := `
		SELECT
			toString(collection_id) as collection_id,
			collection,
			slug,
			model_value,
			model_mark,
			purchases,
			volume,
			timeframe,
			updated_at
		FROM gifts.hot_deals_by_tonnel
		ORDER BY volume DESC, purchases DESC
		LIMIT 100
	`

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	rows, err := conn.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("ошибка выполнения запроса hot deals: %v", err)
	}
	defer rows.Close()

	var results []HotDealData
	for rows.Next() {
		var data HotDealData
		var volumeFloat float32 // Используем float32 для совместимости с ClickHouse

		if err := rows.Scan(
			&data.CollectionID,
			&data.Collection,
			&data.Slug,
			&data.ModelValue,
			&data.ModelMark,
			&data.Purchases,
			&volumeFloat,
			&data.Timeframe,
			&data.UpdatedAt,
		); err != nil {
			log.Printf("Ошибка сканирования строки hot deals: %v", err)
			continue
		}

		// Преобразуем float32 в float64 для JSON
		data.Volume = float64(volumeFloat)

		// Генерируем PNG ссылку используя collection_id
		data.PNG = fmt.Sprintf("https://api.changes.tg/original/%s.png", data.CollectionID)

		results = append(results, data)
	}

	log.Printf("Hot deals data loaded: %d records", len(results))
	return results, nil
}

func (ds *DataService) getModelFloorPriceData() ([]ModelFloorPriceData, error) {
	config := CHConfig{
		Host:     getEnvOrDefault("CH_HOST", "localhost"),
		User:     getEnvOrDefault("CH_USER", "default"),
		Password: getEnvOrDefault("CH_PASSWORD", ""),
		Port:     9440,
	}

	conn, err := getCHClient(config)
	if err != nil {
		return nil, fmt.Errorf("ошибка подключения к ClickHouse: %v", err)
	}
	defer conn.Close()

	query := `
		WITH latest_by_model AS (
			SELECT
				toString(collection_id) as collection_id,
				collection,
				model_value,
				slug,
				floor_price,
				dt,
				ROW_NUMBER() OVER (PARTITION BY collection_id, model_value ORDER BY dt DESC) as rn
			FROM gifts.collection_model_floor_by_tonnel
			WHERE dt >= DATE(now()) - INTERVAL 30 DAY
		)
		SELECT
			collection_id,
			collection,
			model_value,
			slug,
			floor_price,
			dt
		FROM latest_by_model
		WHERE rn = 1
		ORDER BY floor_price DESC
		LIMIT 100
	`

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	rows, err := conn.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("ошибка выполнения запроса model floor prices: %v", err)
	}
	defer rows.Close()

	var results []ModelFloorPriceData
	for rows.Next() {
		var data ModelFloorPriceData
		var floorPriceFloat float32 // Используем float32 для совместимости с ClickHouse

		if err := rows.Scan(
			&data.CollectionID,
			&data.Collection,
			&data.ModelValue,
			&data.Slug,
			&floorPriceFloat,
			&data.Date,
		); err != nil {
			log.Printf("Ошибка сканирования строки model floor price: %v", err)
			continue
		}

		// Преобразуем float32 в float64 для JSON
		data.FloorPrice = float64(floorPriceFloat)

		// Генерируем PNG ссылку используя collection_id и model_value
		if data.ModelValue != "" {
			data.PNG = fmt.Sprintf("https://storage.yandexcloud.net/giftstat-cdn/%s/png/%s.png",
				strings.ReplaceAll(data.Collection, " ", "%20"),
				data.ModelValue)
		} else {
			// Fallback к collection_id если model_value пустой
			data.PNG = fmt.Sprintf("https://api.changes.tg/original/%s.png", data.CollectionID)
		}

		results = append(results, data)
	}

	log.Printf("Model floor price data loaded: %d records", len(results))
	return results, nil
}

func (ds *DataService) getMarketCapData() ([]MarketCapData, error) {
	config := CHConfig{
		Host:     getEnvOrDefault("CH_HOST", "localhost"),
		User:     getEnvOrDefault("CH_USER", "default"),
		Password: getEnvOrDefault("CH_PASSWORD", ""),
		Port:     9440,
	}

	conn, err := getCHClient(config)
	if err != nil {
		return nil, fmt.Errorf("ошибка подключения к ClickHouse: %v", err)
	}
	defer conn.Close()

	// Упрощенный запрос - берем все готовые данные из таблицы
	query := `
		SELECT
			toString(collection_id) as collection_id,
			collection as slug,
			dt,
			gifts_count,
			purchases,
			turnover,
			avg_price,
			median_price,
			moving_median_3_days,
			floor_price,
			mcap_median,
			mcap_avg,
			moving_mcap_median,
			mcap_floor,
			prev_day_gifts_count,
			prev_day_purchases,
			prev_day_turnover,
			prev_day_avg_price,
			prev_day_median_price,
			prev_day_moving_median_price,
			prev_day_mcap_median,
			prev_day_mcap_floor,
			prev_day_moving_mcap_median,
			prev_day_floor_price
		FROM gifts.gifts_index
		WHERE dt >= DATE(now()) - INTERVAL 30 DAY
		  AND dt <= now()
		ORDER BY dt DESC, collection_id
	`

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rows, err := conn.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("ошибка выполнения запроса marketcap: %v", err)
	}
	defer rows.Close()

	var results []MarketCapData
	for rows.Next() {
		var data MarketCapData

		if err := rows.Scan(
			&data.CollectionID,
			&data.Slug,
			&data.Date,
			&data.GiftsCount,
			&data.Purchases,
			&data.Turnover,
			&data.AvgPrice,
			&data.MedianPrice,
			&data.MovingMedian3,
			&data.FloorPrice,
			&data.McapMedian,
			&data.McapAvg,
			&data.MovingMcapMedian,
			&data.McapFloor,
			&data.PrevDayGiftsCount,
			&data.PrevDayPurchases,
			&data.PrevDayTurnover,
			&data.PrevDayAvgPrice,
			&data.PrevDayMedianPrice,
			&data.PrevDayMovingMedianPrice,
			&data.PrevDayMcapMedian,
			&data.PrevDayMcapFloor,
			&data.PrevDayMovingMcapMedian,
			&data.PrevDayFloorPrice,
		); err != nil {
			log.Printf("Ошибка сканирования строки marketcap: %v", err)
			continue
		}

		// Генерируем PNG ссылку используя collection_id
		data.PNG = fmt.Sprintf("https://storage.yandexcloud.net/giftstat-cdn/originals/%s/Original.png", data.CollectionID)

		results = append(results, data)
	}

	log.Printf("MarketCap data loaded: %d records", len(results))
	return results, nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
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

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found")
	}

	ds := NewDataService()

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

	r.POST("/process", ds.handleProcessGifts)
	r.GET("/marketcap", ds.handleMarketCap)
	r.GET("/trends", ds.handleTrends)                      // Новый эндпоинт для трендов
	r.GET("/floor_price_model", ds.handleModelFloorPrices) // Новый эндпоинт для цен по моделям
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "data"})
	})

	port := os.Getenv("DATA_SERVICE_PORT")
	if port == "" {
		port = "5003"
	}

	log.Printf("Data service starting on port %s", port)
	log.Fatal(r.Run(":" + port))
}
