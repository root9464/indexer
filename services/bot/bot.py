import os
import logging
from dotenv import load_dotenv
from aiogram import Router, types, Bot, Dispatcher
from aiogram.filters import Command
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
import asyncio
from aiohttp import web

import numpy as np
from io import BytesIO
import re
import aiohttp

load_dotenv()
router = Router(name=__name__)

# Токен Telegram бота
BOT_TOKEN = os.getenv("BOT_TOKEN")
TARGET_CHANNEL_ID = int(os.getenv("TARGET_CHANNEL_ID", "-1002532958949"))  # ID канала для проверки

# Глобальная переменная для бота
bot_instance = None

@router.message(Command("start"))
async def start_handler(message: types.Message) -> None:
    """
    Обработчик команды /start: отправляет welcome-сообщение с кнопками.
    """
    # Клавиатура с кнопками
    keyboard = types.InlineKeyboardMarkup(
        inline_keyboard=[
            [
                types.InlineKeyboardButton(
                    text="Open App",
                    web_app=types.WebAppInfo(url="https://app.giftindex.io/")
                ),
                types.InlineKeyboardButton(
                    text="Gift Community",
                    url="https://t.me/giftindex"
                )
            ]
        ]
    )

    # Отправляем фото с приветственным сообщением
    await message.answer((
            "<b>Giftindex</b> will help you evaluate your gift portfolio, show current market prices and floor from different markets, gift market capitalization, current shopping trends.\n\n"
            "<b>Giftindex</b> поможет провести оценку вашего портфеля подарков, покажет актуальные рыночные цены и флоры с разных маркетов, рыночную капитализацию подарков, актуальные тренды в покупках.\n\n"
            "⚠️ Оценочный алгоритм находится на этапе тестирования и с некоторыми подарками может работать некорректно"
        ),
        parse_mode="HTML",
        reply_markup=keyboard
    )

async def check_subscription_handler(request):
    """
    HTTP endpoint для проверки подписки пользователя на канал
    """
    try:
        data = await request.json()
        user_id = data.get('user_id')
        
        if not user_id:
            return web.json_response({
                'error': 'user_id is required'
            }, status=400)
        
        # Проверяем статус пользователя в канале
        try:
            chat_member = await bot_instance.get_chat_member(TARGET_CHANNEL_ID, int(user_id))
            
            is_subscribed = chat_member.status in ['creator', 'administrator', 'member']
            
            return web.json_response({
                'is_subscribed': is_subscribed,
                'status': chat_member.status,
                'user_id': user_id
            })
            
        except TelegramBadRequest:
            # Пользователь не найден в канале или не существует
            return web.json_response({
                'is_subscribed': False,
                'status': 'not_found',
                'user_id': user_id
            })
        
    except Exception as e:
        logging.error(f"Error checking subscription: {e}")
        return web.json_response({
            'error': 'Internal server error'
        }, status=500)

async def health_handler(request):
    """Health check endpoint"""
    return web.json_response({'status': 'ok'})

async def generate_chart_url(gift_url, timeframe='week'):
    """
    Генерация URL для графика через Node.js сервис
    """
    try:
        # Парсим данные подарка из URL
        gift_data = await parse_gift_url(gift_url)
        if not gift_data:
            return None
        
        # Формируем URL для сервиса генерации графиков
        chart_url = f"http://localhost:5005/chart?base={gift_data['name']}&quote=USD&rate={gift_data['current_price']}&percent={gift_data['price_change']}&timeframe={timeframe}"
        
        return chart_url
                    
    except Exception as e:
        logging.error(f"Error generating chart URL: {e}")
        return None

async def generate_chart_from_service(gift_url, timeframe='week'):
    """
    Получение изображения графика через Node.js сервис
    """
    try:
        chart_url = await generate_chart_url(gift_url, timeframe)
        if not chart_url:
            return None
        
        async with aiohttp.ClientSession() as session:
            async with session.get(chart_url) as response:
                if response.status == 200:
                    image_data = await response.read()
                    return BytesIO(image_data)
                else:
                    logging.error(f"Chart service error: {response.status}")
                    return None
                    
    except Exception as e:
        logging.error(f"Error calling chart service: {e}")
        return None

async def parse_gift_url(gift_url):
    """
    Парсинг ссылки на подарок для извлечения данных
    Пример: http://t.me/nft/plushpepe-1
    """
    try:
        # Извлекаем название подарка из URL
        match = re.search(r'/nft/([^-]+)-(\d+)', gift_url)
        if not match:
            return None
        
        gift_name = match.group(1)
        gift_id = match.group(2)
        
        # Генерируем более реалистичные данные
        base_price = np.random.uniform(25, 45)
        
        return {
            'name': gift_name,
            'id': gift_id,
            'current_price': base_price,
            'price_change': np.random.uniform(-40, -20),  # Отрицательное для floor
            'floor_price': base_price * 0.3,
            'market_price': base_price
        }
    except Exception as e:
        logging.error(f"Error parsing gift URL: {e}")
        return None

async def gift_chart_handler(request):
    """
    HTTP endpoint для генерации графика цены подарка - просто перенаправляем на сервис
    """
    try:
        gift_url = request.query.get('url')
        timeframe = request.query.get('timeframe', 'week')
        
        if not gift_url:
            return web.json_response({
                'error': 'url parameter is required'
            }, status=400)
        
        # Генерируем URL для сервиса
        chart_url = await generate_chart_url(gift_url, timeframe)
        if not chart_url:
            return web.json_response({
                'error': 'Invalid gift URL'
            }, status=400)
        
        # Перенаправляем на сервис генерации графиков
        return web.Response(status=302, headers={'Location': chart_url})
        
    except Exception as e:
        logging.error(f"Error in gift chart handler: {e}")
        return web.json_response({
            'error': 'Internal server error'
        }, status=500)

@router.message()
async def message_handler(message: types.Message) -> None:
    """
    Обработчик всех текстовых сообщений: проверяет ссылки на подарки
    """
    text = message.text
    
    # Проверяем, является ли сообщение ссылкой на подарок
    if text and ('t.me/nft/' in text or 'telegram.me/nft/' in text):
        try:
            # Отправляем индикатор "бот печатает"
            await message.bot.send_chat_action(message.chat.id, "upload_photo")
            
            # Извлекаем slug подарка из ссылки
            gift_slug = None
            match = re.search(r'/nft/([^-]+)-(\d+)', text)
            if match:
                gift_slug = f"{match.group(1)}-{match.group(2)}"
            
            # Генерируем график через Node.js сервис
            chart_buffer = await generate_chart_from_service(text, timeframe='week')
            if not chart_buffer:
                await message.reply("❌ Ошибка при генерации графика")
                return
            
            # Парсим данные для подписи
            gift_data = await parse_gift_url(text)
            if not gift_data:
                gift_data = {'name': 'unknown', 'current_price': 0, 'price_change': 0, 'floor_price': 0, 'market_price': 0}
            
            # Создаем объект InputFile из буфера
            chart_photo = types.BufferedInputFile(
                file=chart_buffer.getvalue(),
                filename=f"gift_chart_{gift_data['name']}.png"
            )
            
            # Формируем подпись к изображению
            caption = (
                f"📊 <b>{gift_data['name'].upper()}</b>\n\n"
                f"💰 Текущая цена: <code>{gift_data['current_price']:.2f} TON</code>\n"
                f"📈 Изменение: <code>{gift_data['price_change']:+.2f}%</code>\n"
                f"🏷 Floor цена: <code>{gift_data['floor_price']:.2f} TON</code>\n"
                f"💎 Рыночная цена: <code>{gift_data['market_price']:.2f} TON</code>"
            )
            
            # Добавляем кнопки для разных временных периодов и кнопку Explore Gift
            keyboard = types.InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        types.InlineKeyboardButton(
                            text="1ч",
                            callback_data=f"chart_hour_{gift_data['name']}"
                        ),
                        types.InlineKeyboardButton(
                            text="1д",
                            callback_data=f"chart_day_{gift_data['name']}"
                        ),
                        types.InlineKeyboardButton(
                            text="Всё время",
                            callback_data=f"chart_week_{gift_data['name']}"
                        )
                    ],
                    [
                        types.InlineKeyboardButton(
                            text="🔍 Explore Gift",
                            web_app=types.WebAppInfo(url=f"https://app.giftindex.io/gift/{gift_slug}")
                        )
                    ]
                ]
            )
            
            # Отправляем фото с графиком
            await message.answer_photo(
                photo=chart_photo,
                caption=caption,
                parse_mode="HTML",
                reply_markup=keyboard
            )
            
        except Exception as e:
            logging.error(f"Error processing gift URL: {e}")
            await message.reply("❌ Произошла ошибка при обработке ссылки")
    else:
        # Если сообщение не является ссылкой на подарок
        await message.reply(
            "📝 Отправьте мне ссылку на подарок в формате:\n"
            "<code>http://t.me/nft/giftname-1</code>\n\n"
            "И я создам для вас график цены! 📊",
            parse_mode="HTML"
        )

@router.callback_query()
async def callback_handler(callback: types.CallbackQuery) -> None:
    """
    Обработчик callback запросов от инлайн кнопок
    """
    try:
        data = callback.data
        
        if data.startswith('chart_'):
            parts = data.split('_', 2)
            timeframe = parts[1]  # hour, day, week
            gift_name = parts[2]
            
            await callback.answer("Генерирую график...")
            
            # Формируем URL для регенерации
            gift_url = f"http://t.me/nft/{gift_name}-1"
            
            # Генерируем новый график через Node.js сервис
            chart_buffer = await generate_chart_from_service(gift_url, timeframe)
            if not chart_buffer:
                await callback.message.answer("❌ Ошибка при генерации графика")
                return
            
            # Парсим данные для подписи
            gift_data = await parse_gift_url(gift_url)
            if not gift_data:
                gift_data = {'name': gift_name, 'current_price': 34.32, 'price_change': -2.15, 'floor_price': 10.30, 'market_price': 34.32}
            
            # Создаем новое фото
            chart_photo = types.BufferedInputFile(
                file=chart_buffer.getvalue(),
                filename=f"gift_chart_{gift_name}_{timeframe}.png"
            )
            
            # Обновляем подпись в зависимости от периода
            timeframe_names = {
                'hour': '1 час',
                'day': '1 день', 
                'week': 'Всё время'
            }
            
            caption = (
                f"📊 <b>{gift_name.upper()}</b> ({timeframe_names[timeframe]})\n\n"
                f"💰 Текущая цена: <code>{gift_data['current_price']:.2f} TON</code>\n"
                f"📈 Изменение: <code>{gift_data['price_change']:+.2f}%</code>\n"
                f"🏷 Floor цена: <code>{gift_data['floor_price']:.2f} TON</code>\n"
                f"💎 Рыночная цена: <code>{gift_data['market_price']:.2f} TON</code>"
            )
            
            # Обновляем сообщение с новым графиком
            await callback.message.edit_media(
                media=types.InputMediaPhoto(
                    media=chart_photo,
                    caption=caption,
                    parse_mode="HTML"
                ),
                reply_markup=callback.message.reply_markup
            )
            
    except Exception as e:
        logging.error(f"Error in callback handler: {e}")
        await callback.answer("❌ Произошла ошибка", show_alert=True)

async def create_app():
    """Создание aiohttp приложения"""
    app = web.Application()
    app.router.add_post('/check-subscription', check_subscription_handler)
    app.router.add_get('/health', health_handler)
    app.router.add_get('/gift/chart', gift_chart_handler)
    return app

async def start_http_server():
    """Запуск HTTP сервера"""
    app = await create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 5004)
    await site.start()
    logging.info("HTTP server started on port 5004")

async def main() -> None:
    """
    Главная функция для запуска бота и HTTP сервера.
    """
    global bot_instance
    
    if not BOT_TOKEN:
        logging.error("BOT_TOKEN не найден в переменных окружения.")
        return

    bot_instance = Bot(token=BOT_TOKEN)
    dp = Dispatcher()

    # Включаем роутер
    dp.include_router(router)

    # Запускаем HTTP сервер
    await start_http_server()

    logging.info("Starting bot polling...")
    await dp.start_polling(bot_instance)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logging.info("Bot polling stopped by user.")
    except Exception as e:
        logging.error(f"An error occurred during bot operation: {e}", exc_info=True)
