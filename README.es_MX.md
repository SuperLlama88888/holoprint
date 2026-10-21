![HoloPrint](images/banner.png)

[![English](https://img.shields.io/badge/Language-English-blue)](README.md) [![简体中文](https://img.shields.io/badge/Language-简体中文-blue)](README.zh-CN.md)
### Sobre nosotros
HoloPrint es una app web que convierte archivos de estructuras de MCBE en packs de recursos mostrando hologramas de construcciones. Se basa en el trabajo de [Structura](https://github.com/RavinMaddHatter/Structura), un proyecto similar. Structura y HoloPrint buscan recrear la experiencia de los mods de Java Edition como [Litematica](https://github.com/maruohon/litematica) y [Schematica](https://github.com/Lunatrius/Schematica) para usuarios de Bedrock Edition a través de packs de recursos.

> [!TIP]
> ¡Mira la [wiki](https://holoprint-mc.github.io/wiki) para instrucciones más detalladas!

### Uso
> [!NOTE]
> En Android el botón "exportar" del bloque de estructura está oculto; por favor usa [este pack](https://holoprint-mc.github.io/exportbutton) para agregarlo de regreso.
1. Usa un bloque de estructura para exportar un archivo `.mcstructure`. Para obtener un bloque de estructura, ejecuta en Minecraft el comando `/give @s structure_block`.  
![Comando para dar el bloque de estructura](images/giveStructureBlockCommand.png)  
![Exportando en el bloque de estructura](images/structureBlockExporting.png)
2. Ve a [https://holoprint-mc.github.io](https://holoprint-mc.github.io), selecciona tu archivo `.mcstructure`, y ajusta las configuraciones.  
![Pantalla de generación del pack](images/packGenerationScreen.png)
3. Genera y descarga tu pack de recursos (`.mcpack`).  
![Pack de recursos activo](images/resourcePackActive.png)
4. Aplica tu pack de recursos y coloca un estante de armadura en tu mundo.  
![Colocando el estante de armadura](images/placingArmourStand.gif)

### controles del holograma ([Wiki](https://holoprint-mc.github.io/wiki/hologram-controls))
- Cambiar renderizado: Ladrillo  
![Cambiando renderizado](images/togglingRendering.gif)
- Cambiar transparencia: Fragmento de amatista (Agacharse para disminuir, pararse para aumentar)  
![Changing transparency](images/changingTransparency.gif)
- Cambiar capa: Cuero (Agacharse para disminuir, pararse para aumentar), o cambiando la pose del estante de armaduras
![Cambiando capa](images/changingLayer.gif)
- Mover holograma: Palo  
![Moviendo holograma](images/movingHologram.gif)
- Rotar holograma: Lingote de cobre  
![Rotando holograma](images/rotatingHologram.gif)
- Validación de bloque: Lingote de hierro  
![Validando estructura](images/validatingStructure.gif)
- Lista de Materiales: Botón "Tab" (teclado), icono de libro (pantalla táctil)  
![Lista de materiales](images/materialList.gif)
- Cambiar tinte: Tinte blanco  
![Cambio de tinte](images/togglingTint.gif)
- Cambiar modo de capa: Pedernal  
![Cambio de modo de capa](images/changingLayerMode.gif)
- Cambiar estructura: Flecha, o golpea el estante de armadura que no está sosteniendo nada  
![Cambiando estructura](images/changingStructure.gif)
- Guardar configuraciones del holograma: Papel  
![Guardando copia](images/savingBackup.gif)
- Controles del estante de armaduras: Dar item o golpealo  
![Controles del estante de armaduras](images/armourStandControls.gif)
- Deshabilitar controles del jugador: Hueso  
![Deshabilitando controles del jugador](images/disablingPlayerControls.gif)
> [!WARNING]
> Los controles del jugador pueden no funcionar bien, pero los controles del estante de armaduras siempre funcionará.

¡Gracias especiales a **kizoku246** para la casa en esas imagenes!

---

![Packs creados](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/SuperLlama88888/holoprint-stats/main/dailyLogs.json&query=$[-1:]["pack_count"]&label=Packs+creados&color=#4C1)
![Archivos de estructura únicos](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/SuperLlama88888/holoprint-stats/main/dailyLogs.json&query=$[-1:]["structure_count"]&label=Archivos+de+estructura+%C3%BAnicos&color=#4C1)

[![Usage graph](https://raw.githubusercontent.com/SuperLlama88888/holoprint-stats/main/usageGraph.png)](https://github.com/SuperLlama88888/holoprint-stats)
[![Star history chart](https://api.star-history.com/svg?repos=SuperLlama88888/HoloPrint&type=Date)](https://star-history.com/#SuperLlama88888/HoloPrint&Date)

### Creditos
- [Structura](https://github.com/RavinMaddHatter/Structura): Inspiración y base de este proyecto. sin el trabajo de [RavinMaddHatter](https://github.com/RavinMaddHatter) y [demás colaboradores](https://github.com/RavinMaddHatter/Structura/graphs/contributors), este proyecto podría haber tardado decenas de horas más en empezar.
- [Tab Key Playerlist UI](https://github.com/YuuhaLand/Tabkey_Playerlist_UI) por [YuuhaLand](https://github.com/YuuhaLand): Fundación para la "material list UI".
- [Nextr](https://mcpedl.com/user/nextr): Control item textures (ajustes)
- [Indyfficient](https://www.youtube.com/@Indyfficient): La idea de cambiar estructuras golpeando el estante de armaduras.
- [Prowl8413](https://www.youtube.com/@Prowl8413): Retroalimentaciones generales durante el desarrollo.
- [KITTUradiates](https://github.com/KITTUradiates): Retroalimentaciones y sugerencias.
- [ESBE 3G](https://github.com/McbeEringi/esbe-3g) por [McbeEringi](https://github.com/McbeEringi): Base tecnica para la "info screen UI".
- [Rainbow-Editor](https://github.com/PurpleRain-PR/Rainbow-Editor) por [PurpleRain-PR](https://github.com/PurpleRain-PR): La idea de exportar un GLB desde la vista previa.
- Documentación:
  - [Bedrock Wiki](https://wiki.bedrock.dev): ¡Mejor recurso para aprender packs de recursos o comportamientos!
  - [Minecraft Wiki](https://minecraft.wiki): Lista de "Block-entity", estados de bloques, valores de datos, ¡y mucho más!
  - [Bedrock `.mcstructure`. files](https://gist.github.com/tryashtar/87ad9654305e5df686acab05cc4b6205): Explicación de la estructura NBT de archivos de estructuras, por [tryashtar](https://github.com/tryashtar)
  - [Bugrock JSON UI Schemas](https://github.com/KalmeMarq/Bugrock-JSON-UI-Schemas) por [KalmeMarq](https://github.com/KalmeMarq): Menteniendome sano cuando trabajo con la IU; más actualizada que la wiki
  - [Magic Method Docs](https://github.com/BedrockPlus/MagicMethodDocs): Documentación tecnica de [Chainsketch](https://www.youtube.com/@Chainsketch) al pasar datos entre entidades en packs de recursos, escrito por [White](https://github.com/WhiteOnGitHub) y [chyves](https://github.com/notchyves)
  - [Microsoft BE reference docs](https://learn.microsoft.com/en-us/minecraft/creator/reference): Esquemas oficiales para complementos y packs de recursos.
- Librerias de JavaScript:
  - [NBTify](https://github.com/Offroaders123/NBTify): lector de "Minecraft NBT"
  - [tga.js](https://github.com/vthibault/tga.js): conversión de imagenes TGA a PNG
  - [potpack](https://github.com/mapbox/potpack): Texture atlas packing
  - [JSZip](https://github.com/Stuk/jszip): Compresión de packs
  - [Minecraft Creator Tools](https://github.com/Mojang/minecraft-creator-tools): lector "LevelDB"
  - [three.js](https://github.com/mrdoob/three.js): Preview rendering
  - [stats.js](https://github.com/mrdoob/stats.js) and [lil-gui](https://github.com/georgealways/lil-gui): Preview widgets
  - [Supabase](https://supabase.com): Free database for recording packs created
  - [strip-json-comments](https://github.com/sindresorhus/strip-json-comments): Remueve comentarios desde archivos JSON
  - [deepmerge](https://github.com/TehShrike/deepmerge): une archivos JSON