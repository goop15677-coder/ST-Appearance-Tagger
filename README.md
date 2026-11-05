# Auto Appearance Tagger for SillyTavern

An advanced, fully automated character consistency pipeline for SillyTavern. This extension scrapes images from a character card, runs them through an in-browser YOLO face detector and WD Tagger, and uses your local LLM to generate the perfect Stable Diffusion prompt prefix.

## ✨ Features
- **In-Browser AI:** Runs YOLO (face detection) and WD Tagger (image tagging) entirely in your browser via WebAssembly. No Python backend required.
- **Smart Image Scraping:** Automatically finds the Avatar, Creator Notes, First Message, and Alternate Greetings images.
- **ADetailer-Style Cropping:** Detects the largest face in the image and crops it to 448x448 for maximum facial detail extraction.
- **70% Frequency Filter:** Only keeps tags that appear in at least 70% of the images (dropping random backgrounds and poses).
- **LLM Prompt Engineer:** Uses your active LLM to merge the visual tags with the character card's text description, stripping out clothing and backgrounds.
- **Smart Age Slider LoRA:** Reads the character's age and automatically calculates the perfect weight for the `StS_Age_Slider_Illustrious` LoRA (from -5 to 5).
- **Auto-Save:** Automatically injects the final tags into the SillyTavern Image Generation Character Prefix and marks it as "Shareable".

## 🚀 Installation
1. Open SillyTavern and go to the **Extensions** menu.
2. Click **Install extension**.
3. Paste the URL of this repository: `https://github.com/goop15677-coder/ST-Appearance-Tagger`
4. Click Install.

## 🛠️ How to Use
1. Make sure the **Image Generation** extension is enabled in SillyTavern.
2. Select a character.
3. Click the new **Camera** icon next to the Skull (Delete) button.
4. Select the images you want to process (uncheck any banners or memes).
5. Click **Process Selected Images**.
6. Watch the cinematic UI extract the tags.
7. Review the raw tags, then click **Send to LLM**.
8. Review the final prompt and click **Save to Character**.
9. Start roleplaying! The Image Gen extension will now automatically append her physical traits to every generated image.

## ⚙️ Configuration
In the Extension Settings, you can:
- Select your preferred Tagger model (ViT, ViT-Large, or EVA v3).
- Adjust the Confidence Thresholds.
- Import local `.onnx` models (if HuggingFace is blocked in your region).
- **Edit the LLM Prompt Template:** Customize the exact instructions the LLM uses to format your tags.

## ⚠️ Note on Age Slider LoRA
The default prompt uses `<lora:StS_Age_Slider_Illustrious_v1:WEIGHT>`. If you do not have this LoRA installed, Forge Neo will simply ignore the tag. You can change the LoRA name in the Extension Settings.

## Credits
Created by goop15677-coder. 
Special thanks to SmilingWolf for the WD Tagger models, deepghs for the anime face detection model, and the SillyTavern community.
