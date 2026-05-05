/*
ESP32 Touch + WS2812B LED Control
Functions:
- T0 (GPIO4): Toggle LED on/off
- T2 (GPIO2): Next mode (Normal/Breathe/Flash)
- T5 (GPIO12): Next color
- T1 (GPIO0): Disabled (BOOT button)
*/

#include "Arduino.h"
#include <Adafruit_NeoPixel.h>

#define PIN_WS2812 48
#define NUM_LEDS 1

Adafruit_NeoPixel pixels(NUM_LEDS, PIN_WS2812, NEO_GRB + NEO_KHZ800);

int threshold = 0;

bool touch0detected = false;
bool touch1detected = false;
bool touch2detected = false;
bool touch5detected = false;

bool ledOn = true;
int currentColor = 0;
int currentMode = 0;

unsigned long lastBreathTime = 0;
int breathValue = 0;
bool breathDirection = true;

unsigned long lastFlashTime = 0;
bool flashState = false;

uint32_t colors[] = {
  pixels.Color(255, 0, 0),
  pixels.Color(0, 255, 0),
  pixels.Color(0, 0, 255),
  pixels.Color(255, 255, 0),
  pixels.Color(0, 255, 255),
  pixels.Color(255, 0, 255),
  pixels.Color(255, 255, 255)
};
const int numColors = sizeof(colors) / sizeof(colors[0]);

const char* modeNames[] = {"Normal", "Breathe", "Flash"};

void gotTouch0() { touch0detected = true; }
void gotTouch1() { touch1detected = true; }
void gotTouch2() { touch2detected = true; }
void gotTouch5() { touch5detected = true; }

void setColor(uint32_t color) {
  pixels.setPixelColor(0, color);
  pixels.show();
}

void setColorBrightness(uint32_t color, int brightness) {
  uint8_t r = (color >> 16) & 0xFF;
  uint8_t g = (color >> 8) & 0xFF;
  uint8_t b = color & 0xFF;
  
  r = r * brightness / 255;
  g = g * brightness / 255;
  b = b * brightness / 255;
  
  pixels.setPixelColor(0, pixels.Color(r, g, b));
  pixels.show();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  touchSetDefaultThreshold(10);
  pixels.begin();
  
  touchAttachInterrupt(4, gotTouch0, threshold);
  // touchAttachInterrupt(0, gotTouch1, threshold);  // Disabled - GPIO0 is BOOT button
  touchAttachInterrupt(2, gotTouch2, threshold);
  touchAttachInterrupt(12, gotTouch5, threshold);
  
  setColor(colors[currentColor]);
  
  Serial.println("\n=== ESP32 Touch + WS2812B Control ===");
  Serial.println("T0 (GPIO4): Toggle LED on/off");
  Serial.println("T2 (GPIO2): Switch mode");
  Serial.println("T5 (GPIO12): Switch color");
  Serial.println("T1 (GPIO0): Disabled (BOOT button)");
  Serial.printf("Current: Power=%s, Color=%d/%d, Mode=%s\n", 
    ledOn ? "ON" : "OFF", currentColor, numColors-1, modeNames[currentMode]);
}

void handleTouch() {
  if (touch0detected) {
    touch0detected = false;
    if (!touchInterruptGetLastStatus(4)) {
      ledOn = !ledOn;
      Serial.printf("LED: %s\n", ledOn ? "ON" : "OFF");
      if (!ledOn) {
        setColor(pixels.Color(0, 0, 0));
      } else {
        setColor(colors[currentColor]);
      }
    }
  }
  
  // T1 (GPIO0) disabled - BOOT button
  // if (touch1detected) {
  //   touch1detected = false;
  //   if (!touchInterruptGetLastStatus(0)) {
  //     if (ledOn) {
  //       currentColor = (currentColor + 1) % numColors;
  //       Serial.printf("Color changed: %d/%d\n", currentColor, numColors-1);
  //       setColor(colors[currentColor]);
  //     }
  //   }
  // }
  
  if (touch2detected) {
    touch2detected = false;
    if (!touchInterruptGetLastStatus(2)) {
      if (ledOn) {
        currentMode = (currentMode + 1) % 3;
        Serial.printf("Mode changed: %s\n", modeNames[currentMode]);
        if (currentMode == 0) {
          setColor(colors[currentColor]);
        }
        breathValue = 0;
        breathDirection = true;
        flashState = false;
      }
    }
  }
  
  if (touch5detected) {
    touch5detected = false;
    if (!touchInterruptGetLastStatus(12)) {
      if (ledOn) {
        currentColor = (currentColor + 1) % numColors;
        Serial.printf("Color changed: %d/%d\n", currentColor, numColors-1);
        setColor(colors[currentColor]);
      }
    }
  }
}

void handleEffect() {
  if (!ledOn || currentMode == 0) return;
  
  if (currentMode == 1) {
    if (millis() - lastBreathTime >= 10) {
      lastBreathTime = millis();
      
      if (breathDirection) {
        breathValue += 2;
        if (breathValue >= 255) {
          breathValue = 255;
          breathDirection = false;
        }
      } else {
        breathValue -= 2;
        if (breathValue <= 0) {
          breathValue = 0;
          breathDirection = true;
        }
      }
      
      setColorBrightness(colors[currentColor], breathValue);
    }
  } else if (currentMode == 2) {
    if (millis() - lastFlashTime >= 500) {
      lastFlashTime = millis();
      flashState = !flashState;
      
      if (flashState) {
        setColor(colors[currentColor]);
      } else {
        setColor(pixels.Color(0, 0, 0));
      }
    }
  }
}

void loop() {
  handleTouch();
  handleEffect();
  delay(10);
}
