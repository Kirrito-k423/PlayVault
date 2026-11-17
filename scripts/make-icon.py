from PIL import Image, ImageDraw
from pathlib import Path
root = Path(__file__).resolve().parent.parent / 'assets'
root.mkdir(exist_ok=True)
img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle((0, 0, 255, 255), radius=54, fill='#191e20')
draw.line([(128, 26), (218, 78), (218, 179), (128, 231), (38, 179), (38, 78), (128, 26)], fill='#f5d773', width=10, joint='curve')
draw.polygon([(98, 80), (180, 128), (98, 176)], fill='#f5d773')
img.save(root / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
img.save(root / 'icon.png')
