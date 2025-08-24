![HoloPrint](images/banner.png)

[![简体中文](https://img.shields.io/badge/Language-简体中文-blue)](README.zh-CN.md)
### About
HoloPrint is a web app that converts MCBE structure files into resource packs showing holograms of builds. It builds off the work of [Structura](https://github.com/RavinMaddHatter/Structura), a similar project. Both Structura and HoloPrint aim to recreate the experience of Java Edition mods like [Litematica](https://github.com/maruohon/litematica) and [Schematica](https://github.com/Lunatrius/Schematica) for Bedrock Edition users through resource packs.

> [!TIP]
> View the [wiki](https://holoprint-mc.github.io/wiki) for more detailed instructions!

### Usage
> [!NOTE]
> On Android the Structure Block export button is hidden; please use [this pack](https://holoprint-mc.github.io/exportbutton) to add it back.
1. Use a Structure Block to export a `.mcstructure` file. To get a structure block, run the command `/give @s structure_block`.  
![Give Structure Block command](images/giveStructureBlockCommand.png)  
![Structure Block exporting](images/structureBlockExporting.png)
2. Go to [https://holoprint-mc.github.io](https://holoprint-mc.github.io), select your `.mcstructure` file, and tweak settings.  
![Pack generation screen](images/packGenerationScreen.png)
3. Generate and download your resource pack (`.mcpack`).  
![Resource pack active](images/resourcePackActive.png)
4. Apply your resource pack and place an armour stand in your world.  
![Placing armour stand](images/placingArmourStand.gif)

### Hologram controls ([Wiki](https://holoprint-mc.github.io/wiki/hologram-controls))
- Toggle rendering: Brick  
![Toggling rendering](images/togglingRendering.gif)
- Change transparency: Amethyst shard (sneak to decrease, stand to increase)  
![Changing transparency](images/changingTransparency.gif)
- Change layer: Leather (sneak to decrease, stand to increase), or changing the pose on the armour stand  
![Changing layer](images/changingLayer.gif)
- Move hologram: Stick  
![Moving hologram](images/movingHologram.gif)
- Rotate hologram: Copper ingot  
![Rotating hologram](images/rotatingHologram.gif)
- Block validation: Iron ingot  
![Validating structure](images/validatingStructure.gif)
- Material list: Tab button (keyboard), book icon (touch)  
![Material list](images/materialList.gif)
- Toggle tint: White dye  
![Toggle tint](images/togglingTint.gif)
- Change layer mode: Flint  
![Change layer mode](images/changingLayerMode.gif)
- Change structure: Arrow, or hit armour stand that's holding nothing  
![Changing structure](images/changingStructure.gif)
- Save hologram settings: Paper  
![Saving backup](images/savingBackup.gif)
- Armour stand controls: Give item or hit  
![Armour stand controls](images/armourStandControls.gif)
- Disable player controls: Bone  
![Disabling player controls](images/disablingPlayerControls.gif)
> [!WARNING]
> Player controls may be unreliable, but armour stand controls will always work.

Special thanks to **kizoku246** for the house in these images!

---

![Packs created](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/SuperLlama88888/holoprint-stats/main/dailyLogs.json&query=$[-1:]["pack_count"]&label=Packs+created&color=#4C1)
![Unique structure files](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/SuperLlama88888/holoprint-stats/main/dailyLogs.json&query=$[-1:]["structure_count"]&label=Unique+structure+files&color=#4C1)

[![Usage graph](https://raw.githubusercontent.com/SuperLlama88888/holoprint-stats/main/usageGraph.png)](https://github.com/SuperLlama88888/holoprint-stats)
[![Star history chart](https://api.star-history.com/svg?repos=SuperLlama88888/HoloPrint&type=Date)](https://star-history.com/#SuperLlama88888/HoloPrint&Date)

### Credit
- [Structura](https://github.com/RavinMaddHatter/Structura): Inspiration, laying the foundation for this project. Without the work of [RavinMaddHatter](https://github.com/RavinMaddHatter) and [others](https://github.com/RavinMaddHatter/Structura/graphs/contributors), this project would've taken tens of hours more to get started.
- [Tab Key Playerlist UI](https://github.com/YuuhaLand/Tabkey_Playerlist_UI) by [YuuhaLand](https://github.com/YuuhaLand): Foundation for the material list UI
- [Nextr](https://mcpedl.com/user/nextr): Control item textures (tweaked)
- [Indyfficient](https://www.youtube.com/@Indyfficient): The idea of changing structure by hitting the armour stand
- [Prowl8413](https://www.youtube.com/@Prowl8413): General feedback during development
- Documentation:
  - [Bedrock Wiki](https://wiki.bedrock.dev): Best resource for learning about resource/behaviour packs!
  - [Minecraft Wiki](https://minecraft.wiki): Block entity list, block states and data values, and so much more!
  - [Bedrock `.mcstructure`. files](https://gist.github.com/tryashtar/87ad9654305e5df686acab05cc4b6205): Explanation of the NBT structure of structure files, by [tryashtar](https://github.com/tryashtar)
  - [Bugrock JSON UI Schemas](https://github.com/KalmeMarq/Bugrock-JSON-UI-Schemas) by [KalmeMarq](https://github.com/KalmeMarq): Keeping me sane when working with the UI; more up-to-date than the wiki
  - [Magic Method Docs](https://github.com/BedrockPlus/MagicMethodDocs): Documentation of [Chainsketch](https://www.youtube.com/@Chainsketch)'s technique to pass data between entities in resource packs, written by [White](https://github.com/WhiteOnGitHub) and [chyves](https://github.com/notchyves)
  - [Microsoft BE reference docs](https://learn.microsoft.com/en-us/minecraft/creator/reference): Official schemas for addons/resource packs
- JavaScript libraries:
  - [NBTify](https://github.com/Offroaders123/NBTify): Minecraft NBT reader
  - [tga.js](https://github.com/vthibault/tga.js): TGA to PNG image conversion
  - [potpack](https://github.com/mapbox/potpack): Texture atlas packing
  - [JSZip](https://github.com/Stuk/jszip): Pack zipping
  - [Minecraft Creator Tools](https://github.com/Mojang/minecraft-creator-tools): LevelDB reader
  - [three.js](https://github.com/mrdoob/three.js): Preview rendering
  - [stats.js](https://github.com/mrdoob/stats.js) and [lil-gui](https://github.com/georgealways/lil-gui): Preview widgets
  - [Supabase](https://supabase.com): Free database for recording packs created
  - [strip-json-comments](https://github.com/sindresorhus/strip-json-comments): Removes comments from JSON files
  - [deepmerge](https://github.com/TehShrike/deepmerge): Merges JSON files