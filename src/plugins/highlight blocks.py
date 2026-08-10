from PIL import Image, ImageDraw
from pathlib import Path
import os
import shutil
import uuid

script_dir = Path(__file__).resolve().parent
os.chdir(script_dir)

print("""Welcome to the Higlight Blocks plugin by Palexari12! First of all, open your Holoprint resource pack and copy here pack_icon.png and textures/holoprint/entity/hologram_opacity_1.png.
      When you are done, please ask these few questions: """)
immagineOlogramma = ""

bloccoADestra = x = 5
bloccoInGiù = y = 4
posizione = x, y
livelloAlpha = 125

try:
    bloccoADestra = x = int(input("Count the blocks from left to right. What number is yours?: "))
    bloccoASinistra = y = int(input("And from up to down?: "))
except ValueError:
    bloccoADestra = x = 4
    bloccoASinistra = y = 5
    print("Using default values for block choosing...")

try:
    livelloAlpha = int(input("Block visibility, the higher it is, the better it gets (transparency, from to 255, default 125): "))
except ValueError:
    livelloAlpha = 125
    print("Using default values for alpha level...")

mcstructure = input("OPTIONAL: structure name: ")

blockToSHOW = input("OPTIONAL: highlighted block's name: ")


def autoFillerConfig(controllo, default):
    if controllo == None or controllo == "":
        return default


immagineOlogramma = autoFillerConfig(immagineOlogramma, "hologram_opacity_1.png")

imgAtlas = Image.open(immagineOlogramma)

imgAtlasSize = imgAtlas.size


def createLogo():
    imgAtlas = Image.open(immagineOlogramma)

    coordinatescrop = (x1, y1, x2, y2)

    block = imgAtlas.crop(coordinatescrop)

    logo = Image.open("pack_icon.png")

    logo.paste(block, (96, 96))

    logo.save("pack_icon.png")

def FindBlock(imgAtlasSize):
    global x1, x2, y1, y2
    angolobassodestrox = x2 = (sizeBlocks * x) - 1
    angolobassodestroy = y2 = (sizeBlocks * y) - 1
    angoloaltosinistrox = x1 = (sizeBlocks * x) - sizeBlocks
    angoloaltosinistroy = y1 = (sizeBlocks * y) - sizeBlocks

    imgmaschera = Image.new("RGBA", imgAtlasSize, color="black")

    imgmascheraDRAW = ImageDraw.Draw(imgmaschera)

    imgmascheraDRAW.rectangle([x1, y1, x2, y2], fill="red")

    imgmaschera.save("maschera.png")

    imgmaschera.putalpha(livelloAlpha)

    imgmaschera.save("mascheraTrasparente.png")

    imgmaschera = Image.alpha_composite(imgAtlas, imgmaschera)

    imgmaschera.save("finalTexture.png")

    print("Immagini create!")


def createResourcepack():
    global attempt
    attempt = 0
    filenotcreated = True
    version = "1, 1, 0"

    MinecraftBedrockDir = Path(r"C:\Users\{user}\AppData\roaming\Minecraft Bedrock\Users\Shared\games\com.mojang\resource_packs")

    # uuid generator

    id1 = uuid.uuid4()
    id2 = uuid.uuid4()

    while filenotcreated == True:
        try:
            attempt += 1
            os.makedirs("HoloprintPluginHighlightBlocks" + str(attempt))
            filenotcreated = False
        except FileExistsError:
            filenotcreated = True

    os.makedirs(f"HoloprintPluginHighlightBlocks{str(attempt)}/textures/holoprint/entity")

    with open(f"HoloprintPluginHighlightBlocks{str(attempt)}/manifest.json", "x") as file:
        file.write(f"""{{
    "format_version": 2,
    "header": {{
        "description": "Pack {str(attempt)} created with Holoprint Plugin Highlight Blocks by Palexari12!",
        "name": "Holoprint Plugin Highlight Blocks {mcstructure} {blockToSHOW}",
        "uuid": "{id1}",
        "version": [ {version} ],
        "min_engine_version": [ 1, 16, 0 ]
    }},
    "modules": [
        {{
            "description": "Highlights certain blocks through custom textures",
            "type": "resources",
            "uuid": "{id2}",
            "version": [ 1, 1, 0 ]
        }}
    ]
}}""")

    shutil.copy2("pack_icon.png", f"HoloprintPluginHighlightBlocks{str(attempt)}")
    shutil.copy2("finalTexture.png", f"HoloprintPluginHighlightBlocks{str(attempt)}/textures/holoprint/entity/hologram_opacity_1.png")
    shutil.copy2("finalTexture.png", f"HoloprintPluginHighlightBlocks{str(attempt)}/textures/holoprint/entity/hologram_opacity_0.9.png")
    shutil.copy2("finalTexture.png", f"HoloprintPluginHighlightBlocks{str(attempt)}/textures/holoprint/entity/hologram_opacity_0.8.png")
    shutil.copy2("finalTexture.png", f"HoloprintPluginHighlightBlocks{str(attempt)}/textures/holoprint/entity/hologram_opacity_0.7.png")
    shutil.copy2("finalTexture.png", f"HoloprintPluginHighlightBlocks{str(attempt)}/textures/holoprint/entity/hologram_opacity_0.6.png")
    shutil.copy2("finalTexture.png", f"HoloprintPluginHighlightBlocks{str(attempt)}/textures/holoprint/entity/hologram_opacity_0.5.png")
    shutil.copy2("finalTexture.png", f"HoloprintPluginHighlightBlocks{str(attempt)}/textures/holoprint/entity/hologram_opacity_0.4.png")

    for i in range(4, 10):
        currentImage = Image.open(f"HoloprintPluginHighlightBlocks{str(attempt)}/textures/holoprint/entity/hologram_opacity_0." + str(i) + ".png")
        transparentTool = Image.new("RGBA", imgAtlasSize, (0, 0, 0, 0))

        opacity = "0." + str(i)

        alphaedImage = Image.blend(transparentTool, currentImage, float(opacity))

        alphaedImage.save(f"HoloprintPluginHighlightBlocks{str(attempt)}/textures/holoprint/entity/hologram_opacity_0." + str(i) + ".png")

def findGrid():
    global sizeBlocks

    level64_32 = 0

    pixel64_1 = imgAtlas.getpixel((5, 31))
    pixel64_2 = imgAtlas.getpixel((5, 32))

    pixel64_3 = imgAtlas.getpixel((5, 63))
    pixel64_4 = imgAtlas.getpixel((5, 64))

    pixel64_5 = imgAtlas.getpixel((5, 95))
    pixel64_6 = imgAtlas.getpixel((5, 96))

    # divisione

    pixel64_1_1, pixel64_1_2, pixel64_1_3, pixel64_1_4 = pixel64_1
    pixel64_2_1, pixel64_2_2, pixel64_2_3, pixel64_2_4 = pixel64_2
    pixel64_3_1, pixel64_3_2, pixel64_3_3, pixel64_3_4 = pixel64_3
    pixel64_4_1, pixel64_4_2, pixel64_4_3, pixel64_4_4 = pixel64_4
    pixel64_5_1, pixel64_5_2, pixel64_5_3, pixel64_5_4 = pixel64_5
    pixel64_6_1, pixel64_6_2, pixel64_6_3, pixel64_6_4 = pixel64_6

    def checkPixels(a, b, c, d):
        if ((a < 50 and a > 0) and (b < 50 and b > 0) and (c < 250 and c > 150) and (d == 255)):
            return "pixelB"
        return "pixelO"

    count = 0

    sizeBlocks = checkPixels(pixel64_1_1, pixel64_1_2, pixel64_1_3, pixel64_1_4)
    if sizeBlocks == "pixelB":
        count += 1
    sizeBlocks = checkPixels(pixel64_2_1, pixel64_2_2, pixel64_2_3, pixel64_2_4)
    if sizeBlocks == "pixelB":
        count += 1
    sizeBlocks = checkPixels(pixel64_3_1, pixel64_3_2, pixel64_3_3, pixel64_3_4)
    if sizeBlocks == "pixelB":
        count -= 1
    sizeBlocks = checkPixels(pixel64_4_1, pixel64_4_2, pixel64_4_3, pixel64_4_4)
    if sizeBlocks == "pixelB":
        count -= 1
    sizeBlocks = checkPixels(pixel64_5_1, pixel64_5_2, pixel64_5_3, pixel64_5_4)
    if sizeBlocks == "pixelB":
        count += 1
    sizeBlocks = checkPixels(pixel64_6_1, pixel64_6_2, pixel64_6_3, pixel64_6_4)
    if sizeBlocks == "pixelB":
        count += 1

    if count == 2:
        sizeBlocks = 32
    else:
        sizeBlocks = 64

    print("Grid: " + str(sizeBlocks))

findGrid()

FindBlock(imgAtlasSize)

createLogo()

createResourcepack()
