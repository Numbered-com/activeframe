#!/bin/bash

node ../af.js "meridian.mp4" "../docs/assets/meridian_h264.af" 1920 h264 30 25
node ../af.js "meridian.mp4" "../docs/assets/meridian_h265.af" 1920 h265 30 25

node ../af.js "meridian_portrait.mp4" "../docs/assets/p_meridian_h264.af" 800 h264 30 25
node ../af.js "meridian_portrait.mp4" "../docs/assets/p_meridian_h265.af" 800 h265 30 25
