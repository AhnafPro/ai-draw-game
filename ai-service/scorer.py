from flask import Flask, request, jsonify
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import io
import base64

app = Flask(__name__)

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

@app.route('/')
def health_check():
    return "AI Scorer Service is Online"

@app.route('/rate', methods=['POST'])
def rate_drawing():
    data = request.json
    topic = data.get('topic', '')
    image_b64 = data.get('image', '')

    if "base64," in image_b64:
        image_b64 = image_b64.split("base64,")[1]

    image_data = base64.b64decode(image_b64)
    image = Image.open(io.BytesIO(image_data))

    inputs = processor(text=[topic], images=image, return_tensors="pt", padding=True)
    outputs = model(**inputs)

    score_logit = outputs.logits_per_image.item()
    score = min(max((score_logit - 15) * 6, 0), 100)

    return jsonify({"score": int(score)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
