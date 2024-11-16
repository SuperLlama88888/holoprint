# HoloPrint
## Minecraft Bedrock Build Tool

<img src="assets/logo_288.png" width="200" alt="HoloPrint logo"/>

### About
HoloPrint is a web app that converts MCBE structure files into resource packs showing holograms of builds. It builds off the work of [Structura](https://github.com/RavinMaddHatter/Structura), a similar project. Both Structura and HoloPrint aim to recreate the experience of Java Edition mods like [Litematica](https://github.com/maruohon/litematica) and [Schematica](https://github.com/Lunatrius/Schematica) for Bedrock Edition users through resource packs.

### Usage
> [!NOTE]
> On Android the Structure Block export button is hidden; please use [this pack](https://github.com/bud-aj29/BE_Structure_Export_Import_Show/releases/download/release_v0.0.1/Structure_Export_Import_Show_v0.0.1.Resource.mcpack) by [bud-aj29](https://github.com/bud-aj29) to add it back.
1. Use a Structure Block to export a `.mcstructure` file. To get a structure block, run the command `/give @s structure_block`.
2. Go to [https://superllama88888.github.io/holoprint](https://superllama88888.github.io/holoprint), select your `.mstructure` file, and tweak settings.
3. Generate and download your resource pack (`.mcpack`).
4. Apply your resource pack and place an armour stand in your world.

![Placing armour stand](https://github.com/user-attachments/assets/facfde59-7ff9-4381-8f35-0815cf3072a9)

#### Player controls
- Toggle rendering: Stone  
![Toggling rendering](https://github.com/user-attachments/assets/b48a931b-1d36-4b3d-8719-5ccf47411b79)
- Change transparency: Glass (sneak to decrease, stand to increase)  
![Changing transparency](https://github.com/user-attachments/assets/edee3e05-f2d9-4085-8fdf-f6f435d0f0e6)
- Change layer: Planks (sneak to decrease, stand to increase), or changing the pose on the armor stand  
![Changing layer](https://github.com/user-attachments/assets/ee6b848d-e25a-4fbf-b2ab-91867460fdd6)
- Move hologram (third person only): Stick  
![Moving hologram](https://github.com/user-attachments/assets/9c986653-a128-45d4-830b-4397ba783800)
- Block validation: Iron ingot

https://github.com/user-attachments/assets/8c6a25db-9637-454f-97d7-f324e78580e8

---

![Packs created](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/SuperLlama88888/holoprint-stats/main/dailyLogs.json&query=$[-1:]["pack_count"]&label=Packs+created&color=#4C1)
![Unique structure files](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/SuperLlama88888/holoprint-stats/main/dailyLogs.json&query=$[-1:]["structure_count"]&label=Unique+structure+files&color=#4C1)

[![Usage graph](https://raw.githubusercontent.com/SuperLlama88888/holoprint-stats/main/usageGraph.png)](https://github.com/SuperLlama88888/holoprint-stats)
[![Star history chart](https://api.star-history.com/svg?repos=SuperLlama88888/HoloPrint&type=Date)](https://star-history.com/#SuperLlama88888/HoloPrint&Date)

### Credit
- [Structura](https://github.com/RavinMaddHatter/Structura): Inspiration, laying the foundation for this project. Without the work of [RavinMaddHatter](https://github.com/RavinMaddHatter) and [others](https://github.com/RavinMaddHatter/Structura/graphs/contributors), this project would've taken tens of hours more to get started.
- [Tab Key Playerlist UI](https://github.com/YuuhaLand/Tabkey_Playerlist_UI) by [YuuhaLand](https://github.com/YuuhaLand): Foundation for the material list UI
- Documentation:
  - [Bedrock Wiki](https://wiki.bedrock.dev): Best resource for learning about resource/behaviour packs!
  - [Minecraft Wiki](https://minecraft.wiki): Block entity list, block states and data values, and so much more!
  - [Bedrock `.mcstructure`. files](https://gist.github.com/tryashtar/87ad9654305e5df686acab05cc4b6205): Explanation of the NBT structure of structure files, by [tryashtar](https://github.com/tryashtar)
  - [Magic Method Docs](https://github.com/BedrockPlus/MagicMethodDocs): Documentation of [Chainsketch](https://www.youtube.com/@Chainsketch)'s technique to pass data between entities in resource packs, written by [White](https://github.com/WhiteOnGitHub) and [chyves](https://github.com/notchyves)
  - [Microsoft BE reference docs](https://learn.microsoft.com/en-us/minecraft/creator/reference): Official schemas for addons/resource packs
- JavaScript libraries:
  - [NBTify](https://github.com/Offroaders123/NBTify): Minecraft NBT reader
  - [tga.js](https://github.com/vthibault/tga.js): TGA to PNG image conversion
  - [potpack](https://github.com/mapbox/potpack): Texture atlas packing
  - [JSZip](https://github.com/Stuk/jszip): Pack zipping
  - [bridge-model-viewer](https://github.com/bridge-core/model-viewer) and [three.js](https://github.com/mrdoob/three.js): Preview rendering
  - [strip-json-comments](https://github.com/sindresorhus/strip-json-comments): Removes comments from JSON files

### Block entity data needed
- Banner: rendering texture
- Bed: colour
- Campfire/soul campfire: items being cooked
- Cauldron: water colour, potion content
- Chest: double chests, inventory
- Crafter: inventory
- Decorated pot: sherd faces, inventory
- Dispenser/dropper: inventory
- Enchantment table: book rotation?!?!?!
- Flower pot: block inside the pot
- Furnace: inventory
- Hopper: inventory
- Item frame: item inside, rotation
- Jukebox: inventory (disc inside)
- Lectern: showing book or not
- Mob spawner: mob inside
- Moving block: none? this is a wacky one
- Nether reactor: active or not (documentation on this is poor)
- Piston: pushing progress?????? I reckon if it's currently pushing/pulling we make it finish to avoid confusion
- Shulker box: facing direction, inventory
- Sign/hanging sign: text
- Skull: skull type, rotation for when on floor