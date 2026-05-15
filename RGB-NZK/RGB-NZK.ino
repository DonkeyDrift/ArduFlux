#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

#define LED_PIN    48
#define NUM_LEDS   1

#define TOUCH_PIN  4  // T0 - GPIO4，避免使用GPIO0（BOOT键）

Adafruit_NeoPixel pixels(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

// 触摸阈值
int touchThreshold = 0;
bool touchDetected = false;

// 灯的状态
bool isOn = false;
int colorIndex = 0;
int modeIndex = 0;

// 颜色列表
uint32_t colors[] = {
  pixels.Color(255, 0, 0),    // 红色
  pixels.Color(0, 255, 0),    // 绿色
  pixels.Color(0, 0, 255),    // 蓝色
  pixels.Color(255, 255, 0),  // 黄色
  pixels.Color(255, 0, 255),  // 品红
  pixels.Color(0, 255, 255),  // 青色
  pixels.Color(255, 255, 255) // 白色
};
int numColors = sizeof(colors) / sizeof(colors[0]);

// 模式名称
const char* modeNames[] = {"常亮", "呼吸", "闪烁"};
int numModes = sizeof(modeNames) / sizeof(modeNames[0]);

// 触摸中断处理函数
void gotTouch() {
  touchDetected = true;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // 初始化LED
  pixels.begin();
  pixels.clear();
  pixels.show();
  
  // 设置触摸阈值为5%
  touchSetDefaultThreshold(5);
  
  // 附加触摸中断
  touchAttachInterrupt(TOUCH_PIN, gotTouch, touchThreshold);
  
  Serial.println("\n=== 触控彩灯程序 ===");
  Serial.println("触摸GPIO4来控制彩灯");
  Serial.println("功能：短按开关灯，长按切换颜色，连续长按切换模式");
}

// 长按检测时间（毫秒）
#define SHORT_PRESS_TIME  300
#define LONG_PRESS_TIME   1000

unsigned long touchStartTime = 0;
bool isTouching = false;
int pressCount = 0;

void loop() {
  // 处理触摸事件
  if (touchDetected) {
    touchDetected = false;
    
    if (touchInterruptGetLastStatus(TOUCH_PIN)) {
      // 触摸开始
      touchStartTime = millis();
      isTouching = true;
      pressCount = 0;
      Serial.println("触摸开始");
    } else {
      // 触摸释放
      if (isTouching) {
        unsigned long touchDuration = millis() - touchStartTime;
        isTouching = false;
        
        if (touchDuration < SHORT_PRESS_TIME) {
          // 短按：开关灯
          isOn = !isOn;
          if (isOn) {
            Serial.printf("灯已打开 - 颜色: %d, 模式: %s\n", colorIndex, modeNames[modeIndex]);
          } else {
            pixels.clear();
            pixels.show();
            Serial.println("灯已关闭");
          }
        } else if (touchDuration < LONG_PRESS_TIME) {
          // 长按：切换颜色
          colorIndex = (colorIndex + 1) % numColors;
          Serial.printf("切换颜色: %d\n", colorIndex);
          if (isOn) {
            pixels.setPixelColor(0, colors[colorIndex]);
            pixels.show();
          }
        } else {
          // 连续长按：切换模式
          modeIndex = (modeIndex + 1) % numModes;
          Serial.printf("切换模式: %s\n", modeNames[modeIndex]);
        }
      }
    }
  }
  
  // 如果灯是开着的，根据模式执行效果
  if (isOn) {
    static unsigned long lastTime = 0;
    static int brightness = 0;
    static int fadeDirection = 1;
    static bool blinkState = false;
    
    switch (modeIndex) {
      case 0: // 常亮模式
        pixels.setPixelColor(0, colors[colorIndex]);
        pixels.show();
        break;
        
      case 1: // 呼吸模式
        if (millis() - lastTime > 20) {
          lastTime = millis();
          brightness += fadeDirection * 2;
          if (brightness <= 0 || brightness >= 255) {
            fadeDirection = -fadeDirection;
          }
          uint32_t color = colors[colorIndex];
          uint8_t r = (color >> 16) & 0xFF;
          uint8_t g = (color >> 8) & 0xFF;
          uint8_t b = color & 0xFF;
          float scale = brightness / 255.0;
          pixels.setPixelColor(0, pixels.Color(r * scale, g * scale, b * scale));
          pixels.show();
        }
        break;
        
      case 2: // 闪烁模式
        if (millis() - lastTime > 500) {
          lastTime = millis();
          blinkState = !blinkState;
          if (blinkState) {
            pixels.setPixelColor(0, colors[colorIndex]);
          } else {
            pixels.clear();
          }
          pixels.show();
        }
        break;
    }
  }
  
  delay(10);
}