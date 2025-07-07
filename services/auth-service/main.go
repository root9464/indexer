package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

type TelegramUser struct {
	ID           int64  `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name,omitempty"`
	Username     string `json:"username,omitempty"`
	PhotoURL     string `json:"photo_url,omitempty"`
	LanguageCode string `json:"language_code,omitempty"`
}

type AuthResponse struct {
	Success   bool          `json:"success"`
	User      *TelegramUser `json:"user,omitempty"`
	Token     string        `json:"token,omitempty"`
	Error     string        `json:"error,omitempty"`
	ErrorCode string        `json:"error_code,omitempty"`
}

type AuthService struct {
	botToken string
	db       *sql.DB
}

type UserRecord struct {
	ID           int64     `db:"id"`
	TelegramID   int64     `db:"telegram_id"`
	Username     string    `db:"username"`
	FirstName    string    `db:"first_name"`
	LastName     string    `db:"last_name"`
	PhotoURL     string    `db:"photo_url"`
	LanguageCode string    `db:"language_code"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
	LastSeenAt   time.Time `db:"last_seen_at"`
}

func NewAuthService() *AuthService {
	return &AuthService{
		botToken: os.Getenv("BOT_TOKEN"),
	}
}

func (as *AuthService) initDB() error {
	dbHost := getEnvOrDefault("DB_HOST", "localhost")
	dbPort := getEnvOrDefault("DB_PORT", "5432")
	dbUser := getEnvOrDefault("DB_USER", "postgres")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := getEnvOrDefault("DB_NAME", "postgres")

	if dbPassword == "" {
		log.Printf("❌ DB_PASSWORD environment variable is required")
		log.Printf("Available DB environment variables: DB_HOST=%s, DB_PORT=%s, DB_USER=%s, DB_NAME=%s",
			dbHost, dbPort, dbUser, dbName)
		return fmt.Errorf("DB_PASSWORD environment variable is required")
	}

	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName)

	log.Printf("🔄 Connecting to database: host=%s, port=%s, user=%s, dbname=%s",
		dbHost, dbPort, dbUser, dbName)

	var err error
	as.db, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Проверяем соединение
	if err = as.db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	log.Printf("✅ Connected to database successfully")
	return nil
}

func (as *AuthService) getOrCreateUser(telegramUser *TelegramUser) (*UserRecord, bool, error) {
	// Сначала пытаемся найти пользователя
	var user UserRecord
	query := `
		SELECT id, telegram_id, username, first_name, last_name, photo_url, language_code, created_at, updated_at, last_seen_at
		FROM users 
		WHERE telegram_id = $1
	`

	err := as.db.QueryRow(query, telegramUser.ID).Scan(
		&user.ID, &user.TelegramID, &user.Username, &user.FirstName,
		&user.LastName, &user.PhotoURL, &user.LanguageCode,
		&user.CreatedAt, &user.UpdatedAt, &user.LastSeenAt,
	)

	if err == sql.ErrNoRows {
		// Пользователь не найден, создаем нового
		log.Printf("👤 Creating new user: %d (@%s)", telegramUser.ID, telegramUser.Username)

		insertQuery := `
			INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, language_code, last_seen_at)
			VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
			RETURNING id, telegram_id, username, first_name, last_name, photo_url, language_code, created_at, updated_at, last_seen_at
		`

		err = as.db.QueryRow(insertQuery,
			telegramUser.ID, telegramUser.Username, telegramUser.FirstName,
			telegramUser.LastName, telegramUser.PhotoURL, telegramUser.LanguageCode,
		).Scan(
			&user.ID, &user.TelegramID, &user.Username, &user.FirstName,
			&user.LastName, &user.PhotoURL, &user.LanguageCode,
			&user.CreatedAt, &user.UpdatedAt, &user.LastSeenAt,
		)

		if err != nil {
			return nil, false, fmt.Errorf("failed to create user: %w", err)
		}

		log.Printf("✅ User created successfully: ID=%d, TelegramID=%d", user.ID, user.TelegramID)
		return &user, true, nil
	} else if err != nil {
		return nil, false, fmt.Errorf("failed to query user: %w", err)
	}

	// Пользователь найден, обновляем last_seen_at и другие поля если изменились
	log.Printf("👤 Found existing user: %d (@%s)", user.TelegramID, user.Username)

	updateQuery := `
		UPDATE users 
		SET username = $2, first_name = $3, last_name = $4, photo_url = $5, 
		    language_code = $6, last_seen_at = CURRENT_TIMESTAMP
		WHERE telegram_id = $1
		RETURNING id, telegram_id, username, first_name, last_name, photo_url, language_code, created_at, updated_at, last_seen_at
	`

	err = as.db.QueryRow(updateQuery,
		telegramUser.ID, telegramUser.Username, telegramUser.FirstName,
		telegramUser.LastName, telegramUser.PhotoURL, telegramUser.LanguageCode,
	).Scan(
		&user.ID, &user.TelegramID, &user.Username, &user.FirstName,
		&user.LastName, &user.PhotoURL, &user.LanguageCode,
		&user.CreatedAt, &user.UpdatedAt, &user.LastSeenAt,
	)

	if err != nil {
		return nil, false, fmt.Errorf("failed to update user: %w", err)
	}

	log.Printf("✅ User updated successfully: ID=%d, TelegramID=%d", user.ID, user.TelegramID)
	return &user, false, nil
}

func (as *AuthService) validateTelegramInitData(initData string) (*TelegramUser, error) {
	log.Printf("🔍 Validating initData (length: %d)", len(initData))

	if as.botToken == "" {
		log.Printf("❌ BOT_TOKEN not configured")
		return nil, fmt.Errorf("BOT_TOKEN not configured")
	}

	params, err := url.ParseQuery(initData)
	if err != nil {
		log.Printf("❌ Failed to parse initData: %v", err)
		return nil, fmt.Errorf("INVALID_FORMAT: invalid initData format")
	}

	hash := params.Get("hash")
	if hash == "" {
		log.Printf("❌ Hash not found in initData")
		return nil, fmt.Errorf("HASH_REQUIRED: hash is required")
	}

	// Создаем data_check_string
	checkParams := make(url.Values)
	for key, values := range params {
		if key != "hash" {
			for _, value := range values {
				checkParams.Add(key, value)
			}
		}
	}

	var keys []string
	for key := range checkParams {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var checkStrings []string
	for _, key := range keys {
		value := checkParams.Get(key)
		checkStrings = append(checkStrings, fmt.Sprintf("%s=%s", key, value))
	}
	dataCheckString := strings.Join(checkStrings, "\n")

	// Проверяем подпись
	secretKey := hmac.New(sha256.New, []byte("WebAppData"))
	secretKey.Write([]byte(as.botToken))
	secretKeyBytes := secretKey.Sum(nil)

	signature := hmac.New(sha256.New, secretKeyBytes)
	signature.Write([]byte(dataCheckString))
	expectedHash := hex.EncodeToString(signature.Sum(nil))

	if hash != expectedHash {
		log.Printf("❌ Hash validation failed. Expected: %s, Got: %s", expectedHash, hash)
		log.Printf("❌ Data check string: %s", dataCheckString)
		return nil, fmt.Errorf("HASH_VALIDATION_FAILED: invalid hash signature")
	}

	// Проверяем auth_date
	authDateStr := params.Get("auth_date")
	if authDateStr == "" {
		return nil, fmt.Errorf("AUTH_DATE_REQUIRED: auth_date not found")
	}

	authDate, err := strconv.ParseInt(authDateStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("AUTH_DATE_INVALID: invalid auth_date format")
	}

	age := time.Now().Unix() - authDate
	if age > 3600 { // 1 час
		log.Printf("❌ Auth data expired. Age: %d seconds", age)
		return nil, fmt.Errorf("AUTH_EXPIRED: session expired")
	}

	// Парсим user данные
	userStr := params.Get("user")
	if userStr == "" {
		return nil, fmt.Errorf("USER_DATA_REQUIRED: user data not found")
	}

	var user TelegramUser
	if err := json.Unmarshal([]byte(userStr), &user); err != nil {
		return nil, fmt.Errorf("USER_DATA_INVALID: invalid user data format")
	}

	if user.ID == 0 || user.FirstName == "" {
		return nil, fmt.Errorf("USER_DATA_INCOMPLETE: incomplete user data")
	}

	// УБИРАЕМ ТРЕБОВАНИЕ USERNAME - позволяем работать без него
	if user.Username == "" {
		log.Printf("⚠️ Warning: Username not set for user %d, but allowing access", user.ID)
		// Генерируем временный username из ID если нет настоящего
		user.Username = fmt.Sprintf("user_%d", user.ID)
	}

	log.Printf("✅ Auth successful: user %d (@%s)", user.ID, user.Username)
	return &user, nil
}

func (as *AuthService) generateToken(user *TelegramUser) string {
	// Простой токен для внутреннего использования
	data := fmt.Sprintf("%d:%s:%d", user.ID, user.Username, time.Now().Unix())
	hash := sha256.Sum256([]byte(data + os.Getenv("JWT_SECRET")))
	return hex.EncodeToString(hash[:])
}

func (as *AuthService) handleAuth(c *gin.Context) {
	var request struct {
		InitData string `json:"init_data" binding:"required"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		log.Printf("❌ Invalid request format: %v", err)
		c.JSON(http.StatusBadRequest, AuthResponse{
			Success:   false,
			Error:     "Invalid request format",
			ErrorCode: "INVALID_REQUEST",
		})
		return
	}

	user, err := as.validateTelegramInitData(request.InitData)
	if err != nil {
		log.Printf("❌ Auth validation failed: %v", err)

		errorCode := "AUTH_FAILED"
		if strings.Contains(err.Error(), "HASH_VALIDATION_FAILED") {
			errorCode = "HASH_VALIDATION_FAILED"
		} else if strings.Contains(err.Error(), "AUTH_EXPIRED") {
			errorCode = "AUTH_EXPIRED"
		} else if strings.Contains(err.Error(), "USERNAME_REQUIRED") {
			errorCode = "USERNAME_REQUIRED"
		} else if strings.Contains(err.Error(), "BOT_TOKEN") {
			errorCode = "SERVER_CONFIG_ERROR"
		}

		c.JSON(http.StatusUnauthorized, AuthResponse{
			Success:   false,
			Error:     err.Error(),
			ErrorCode: errorCode,
		})
		return
	}

	// Сохраняем/обновляем пользователя в базе данных
	userRecord, isNew, err := as.getOrCreateUser(user)
	if err != nil {
		log.Printf("❌ Database error: %v", err)
		c.JSON(http.StatusInternalServerError, AuthResponse{
			Success:   false,
			Error:     "Database error",
			ErrorCode: "DATABASE_ERROR",
		})
		return
	}

	if isNew {
		log.Printf("🎉 New user registered: %d (@%s)", userRecord.TelegramID, userRecord.Username)
	} else {
		log.Printf("👋 Welcome back user: %d (@%s)", userRecord.TelegramID, userRecord.Username)
	}

	token := as.generateToken(user)
	log.Printf("✅ Auth successful, token generated for user %d", user.ID)

	c.JSON(http.StatusOK, AuthResponse{
		Success: true,
		User:    user,
		Token:   token,
	})
}

func (as *AuthService) handleValidateToken(c *gin.Context) {
	token := c.GetHeader("Authorization")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"valid": false, "error": "Token required"})
		return
	}

	// Убираем "Bearer " если есть
	if strings.HasPrefix(token, "Bearer ") {
		token = token[7:]
	}

	// Простая валидация токена (в продакшене нужно более сложную логику)
	if len(token) == 64 { // SHA256 hex
		c.JSON(http.StatusOK, gin.H{"valid": true})
		return
	}

	c.JSON(http.StatusUnauthorized, gin.H{"valid": false, "error": "Invalid token"})
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found")
	}

	service := NewAuthService()
	if service.botToken == "" {
		log.Fatal("BOT_TOKEN is required")
	}

	// Инициализируем подключение к базе данных
	if err := service.initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer service.db.Close()

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

	r.POST("/auth", service.handleAuth)
	r.GET("/validate", service.handleValidateToken)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "auth"})
	})

	port := os.Getenv("AUTH_SERVICE_PORT")
	if port == "" {
		port = "5001"
	}

	log.Printf("Auth service starting on port %s", port)
	log.Fatal(r.Run(":" + port))
}
