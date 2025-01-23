let v, q, t, structureSize, singleLayerMode, structureCount, HOLOGRAM_INITIAL_ACTIVATION, defaultTextureIndex, textureBlobsCount, totalBlocksToValidate, totalBlocksToValidateByLayer, backupSlotCount, toggleRendering, changeOpacity, toggleTint, toggleValidating, changeLayer, decreaseLayer, changeLayerMode, disablePlayerControls, backupHologram, changeStructure, moveHologram, rotateHologram, initVariables, renderingControls, movementControls, broadcastActions, structureWMolang, structureHMolang, structureDMolang;

export function armorStandInitialization() {
	v.hologram_activated = HOLOGRAM_INITIAL_ACTIVATION; // true/false are substituted in here for the different subpacks
	v.hologram.offset_x = 0;
	v.hologram.offset_y = 0;
	v.hologram.offset_z = 0;
	v.hologram.rotation = 0;
	v.hologram.structure_w = $[structureSize[0]];
	v.hologram.structure_h = $[structureSize[1]];
	v.hologram.structure_d = $[structureSize[2]];
	v.hologram.rendering = HOLOGRAM_INITIAL_ACTIVATION;
	v.hologram.texture_index = $[defaultTextureIndex];
	v.hologram.show_tint = false;
	v.hologram.layer = -1;
	v.hologram.layer_mode = $[singleLayerMode];
	v.hologram.validating = false;
	v.hologram.show_wrong_block_overlay = false;
	v.wrong_blocks = -1;
	v.hologram.wrong_block_x = 0;
	v.hologram.wrong_block_y = 0;
	v.hologram.wrong_block_z = 0;
	
	v.hologram.structure_index = 0;
	v.hologram.structure_count = $[structureCount];
	
	// v.hologram.last_held_item = q.get_equipped_item_name ?? "";
	v.hologram.last_held_item = ""; // this will be kept in the backup
	v.last_pose = 0;
	v.last_hurt_direction = q.hurt_direction;
	// v.player_action_counter = t.player_action_counter ?? 0;
	v.player_action_counter = 0;
	v.hologram_dir = 0;
	
	v.spawn_time = q.time_stamp;
	v.player_has_interacted = false;
	v.saving_backup = false;
	v.hologram_backup_index = -1;
	v.hologram_backup_requested_time = -601; // 600 ticks = 30s (how long the backup request lasts for)
	v.skip_spawn_animation = false;
}
export function armorStandPreAnimation() {
	if(q.time_stamp - v.spawn_time < 5) {
		v.last_pose = v.armor_stand.pose_index; // armour stands take a tick or two at the start to set their pose correctly
	}
	v.armor_stand_dir = Math.floor(q.body_y_rotation / 90) + 2; // [south, west, north, east] (since it goes from -180 to 180)
	
	t.should_set_wrong_blocks = false;
	if(q.time_stamp - v.spawn_time < 200 && !v.player_has_interacted) { // if it's less than 10 seconds after being spawned and the player hasn't interacted yet...
		t.just_recovered_backup = false;
		for(let i = 0; i < $[backupSlotCount]; i++) {
			if(!t.just_recovered_backup && !(t.hologram_backup_empty_$[i] ?? true) && t.hologram_backup_$[i].x == q.position(0) && t.hologram_backup_$[i].y == q.position(1) && t.hologram_backup_$[i].z == q.position(2)) {
				v.hologram = t.hologram_backup_$[i];
				t.hologram_backup_empty_$[i] = true;
				t.just_recovered_backup = true;
			}
		}
		if(t.just_recovered_backup) {
			v.player_has_interacted = true;
			v.hologram_activated = true;
			v.skip_spawn_animation = true;
			if(v.hologram.validating) {
				t.should_set_wrong_blocks = true;
			}
		}
	}
	if(!v.hologram_activated) { // even though the subpack is called "punch to activate", changing the pose or giving an item will work as well
		t.activate_hologram = false;
		if(v.last_hurt_direction != q.hurt_direction) {
			v.last_hurt_direction = q.hurt_direction;
			t.activate_hologram = true;
		} else if(v.last_pose != v.armor_stand.pose_index) {
			v.last_pose = v.armor_stand.pose_index;
			t.activate_hologram = true;
		} else if(v.hologram.last_held_item != q.get_equipped_item_name) {
			v.hologram.last_held_item = q.get_equipped_item_name;
			t.activate_hologram = true;
		}
		if(t.activate_hologram) {
			v.hologram_activated = true;
			v.hologram.rendering = true;
		} else {
			return 0; // must have a return value
		}
	}
	
	t.process_action = false; // this is the only place I'm using temp variables for their intended purpose
	t.action = "";
	t.check_layer_validity = false;
	t.changed_structure = false;
	if(v.hologram.last_held_item != q.get_equipped_item_name) {
		v.hologram.last_held_item = q.get_equipped_item_name;
		t.process_action = true;
	}
	if(v.last_hurt_direction != q.hurt_direction) { // hitting the armour stand changes this: https://wiki.bedrock.dev/entities/non-mob-runtime-identifiers.html#notable-queries-3
		v.last_hurt_direction = q.hurt_direction;
		t.process_action = true;
		if(!q.is_item_equipped) { // change structure on hit when holding nothing
			t.action = "next_structure";
		}
	}
	
	if(v.last_pose != v.armor_stand.pose_index) {
		v.last_pose = v.armor_stand.pose_index;
		if(v.hologram.rendering) {
			t.action = "increase_layer";
		}
	}
	
	if(t.process_action) {
		if($[toggleRendering]) {
			t.action = "toggle_rendering";
		} else if($[changeOpacity]) {
			t.action = "increase_opacity";
		} else if($[toggleTint]) {
			t.action = "toggle_tint";
		} else if($[toggleValidating]) {
			t.action = "toggle_validating";
		} else if($[changeLayer]) {
			t.action = "increase_layer";
		} else if($[decreaseLayer]) {
			t.action = "decrease_layer";
		} else if($[changeLayerMode]) {
			t.action = "change_layer_mode";
		} else if($[rotateHologram]) {
			t.action = "rotate_hologram_clockwise";
		} else if($[backupHologram]) {
			t.action = "backup_hologram";
		}
	}
	t.player_action_counter ??= 0;
	if(v.player_action_counter != t.player_action_counter && t.player_action_counter > 0 && t.player_action != "") {
		v.player_action_counter = t.player_action_counter;
		if(!$[disablePlayerControls]) {
			t.action = t.player_action;
		}
	}
	if(t.action != "") {
		v.player_has_interacted = true;
		if(t.action == "toggle_rendering") {
			v.hologram.rendering = !v.hologram.rendering;
		} else if(t.action == "toggle_validating") {
			v.hologram.validating = !v.hologram.validating;
			if(v.hologram.validating) {
				t.should_set_wrong_blocks = true;
			} else {
				v.hologram.show_wrong_block_overlay = false;
			}
		} else if(t.action == "backup_hologram") {
			v.hologram_backup_requested_time = q.time_stamp;
		} else if(v.hologram.rendering) { // opacity, layer, movement, and structure controls require the hologram to be visible, otherwise it could be confusing if you accidentally change something when it's invisible
			if(t.action == "increase_opacity") {
				v.hologram.texture_index++;
				if(v.hologram.texture_index >= $[textureBlobsCount]) {
					v.hologram.texture_index = 0;
				}
			} else if(t.action == "decrease_opacity") {
				v.hologram.texture_index--;
				if(v.hologram.texture_index < 0) {
					v.hologram.texture_index = $[textureBlobsCount - 1];
				}
			} else if(t.action == "toggle_tint") {
				v.hologram.show_tint = !v.hologram.show_tint;
			} else if(t.action == "increase_layer") {
				v.hologram.layer++;
				t.check_layer_validity = true;
			} else if(t.action == "decrease_layer") {
				v.hologram.layer--;
				t.check_layer_validity = true;
			} else if(t.action == "change_layer_mode") {
				v.hologram.layer_mode = 1 - v.hologram.layer_mode; // ez
				t.check_layer_validity = true;
			} else if(t.action == "move_hologram") {
				t.camera_rot_x = q.camera_rotation(0);
				t.camera_rot_y = q.camera_rotation(1);
				if(t.camera_rot_x <= -38) { // slightly more bias towards up/down
					v.hologram.offset_y++;
				} else if(t.camera_rot_x >= 38) {
					v.hologram.offset_y--;
				} else if(t.camera_rot_y > -45 && t.camera_rot_y <= 45) {
					v.hologram.offset_z++;
				} else if(t.camera_rot_y > 45 && t.camera_rot_y <= 135) {
					v.hologram.offset_x++;
				} else if(t.camera_rot_y > -135 && t.camera_rot_y <= -45) {
					v.hologram.offset_x--;
				} else {
					v.hologram.offset_z--;
				}
			} else if(t.action == "rotate_hologram_clockwise") {
				v.hologram.rotation = Math.mod(v.hologram.rotation + 1, 4);
			} else if(t.action == "rotate_hologram_anticlockwise") {
				v.hologram.rotation = Math.mod(v.hologram.rotation + 3, 4); // Molang Math.mod is more of a remainder function (like JS), so it can return values from -3 to 3. Because of this I do + 3 not - 1.
			} else if(t.action == "next_structure" && v.hologram.structure_count > 1) {
				v.hologram.structure_index++;
				t.changed_structure = true;
			} else if(t.action == "previous_structure" && v.hologram.structure_count > 1) {
				v.hologram.structure_index--;
				t.changed_structure = true;
			}
		}
	}
	
	v.hologram_dir = Math.mod(v.armor_stand_dir + v.hologram.rotation, 4);
	if(t.check_layer_validity) {
		if(v.hologram.layer < -1) {
			v.hologram.layer = v.hologram.structure_h - (v.hologram.layer_mode == $[singleLayerMode]? 1 : 2);
		}
		if(v.hologram.layer >= (v.hologram.layer_mode == $[singleLayerMode]? v.hologram.structure_h : v.hologram.structure_h - 1)) {
			v.hologram.layer = -1;
		}
		if(v.hologram.validating) {
			t.should_set_wrong_blocks = true;
		}
	}
	if(t.should_set_wrong_blocks) {
		v.wrong_blocks = (v.hologram.layer == -1? ($[totalBlocksToValidate]) : ($[totalBlocksToValidateByLayer]));
		t.wrong_blocks = v.wrong_blocks;
	}
	if(t.changed_structure) {
		if(v.hologram.structure_index < 0) {
			v.hologram.structure_index = v.hologram.structure_count - 1;
		}
		if(v.hologram.structure_index >= v.hologram.structure_count) {
			v.hologram.structure_index = 0;
		}
		v.hologram.structure_w = $[structureWMolang];
		v.hologram.structure_h = $[structureHMolang];
		v.hologram.structure_d = $[structureDMolang];
		v.hologram.layer = -1;
		v.hologram.validating = false;
		v.hologram.show_wrong_block_overlay = false;
	}
	
	if(v.hologram.validating) {
		// block validation particles rely on temp variables. this code checks if the temp variables are defined; if they are, it updates the internal state; if not, it sets the temp variables to its internal state. very messy ik
		if((t.wrong_blocks ?? -1) == -1) {
			t.wrong_blocks = v.wrong_blocks;
		} else {
			v.wrong_blocks = t.wrong_blocks;
		}
		if((t.show_wrong_block_overlay ?? -1) == -1) {
			t.show_wrong_block_overlay = v.hologram.show_wrong_block_overlay;
		} else {
			v.hologram.show_wrong_block_overlay = t.show_wrong_block_overlay;
		}
		if((t.wrong_block_x ?? -1) == -1) {
			t.wrong_block_x = v.hologram.wrong_block_x;
		} else {
			v.hologram.wrong_block_x = t.wrong_block_x;
		}
		if((t.wrong_block_y ?? -1) == -1) {
			t.wrong_block_y = v.hologram.wrong_block_y;
		} else {
			v.hologram.wrong_block_y = t.wrong_block_y;
		}
		if((t.wrong_block_z ?? -1) == -1) {
			t.wrong_block_z = v.hologram.wrong_block_z;
		} else {
			v.hologram.wrong_block_z = t.wrong_block_z;
		}
	}
	
	v.saving_backup = q.distance_from_camera > 55 || q.time_stamp - v.hologram_backup_requested_time <= 600; // 15 blocks leeway for automatic backups, or 30s after players request a backup
	if(v.saving_backup) {
		// one by one, check each backup slot. if it's empty, we take that spot; if not, try to find which backup slot was set the earliest.
		t.earliest_backup_time_stamp = q.time_stamp + 9999; // all backups should be less than this
		t.earliest_backup_index = -1;
		for(let i = 0; i < $[backupSlotCount]; i++) {
			if(v.hologram_backup_index == -1) {
				if(t.hologram_backup_empty_$[i] ?? true) {
					v.hologram_backup_index = $[i];
				} else if(t.hologram_backup_$[i].backup_time_stamp < t.earliest_backup_time_stamp) {
					t.earliest_backup_time_stamp = t.hologram_backup_$[i].backup_time_stamp;
					t.earliest_backup_index = $[i];
				}
			}
		}
		if(v.hologram_backup_index == -1) { // none are empty, so overwrite the earliest backup
			if(t.earliest_backup_index == -1) { // will only happen when the backup slot count is 0
				return 0;
			}
			v.hologram_backup_index = t.earliest_backup_index;
		}
		
		v.hologram.x = q.position(0);
		v.hologram.y = q.position(1);
		v.hologram.z = q.position(2);
		v.hologram.backup_time_stamp = q.time_stamp;
		for(let i = 0; i < $[backupSlotCount]; i++) {
			if(v.hologram_backup_index == $[i]) {
				t.hologram_backup_$[i] = v.hologram;
				t.hologram_backup_empty_$[i] = false;
			}
		}
	} else if(v.hologram_backup_index != -1) {
		for(let i = 0; i < $[backupSlotCount]; i++) {
			if(v.hologram_backup_index == $[i]) {
				t.hologram_backup_empty_$[i] = true;
			}
		}
		v.hologram_backup_index = -1;
	}
}

export function playerInitVariables() {
	v.player_action_counter ??= 0;
	v.last_player_action_time ??= 0;
	v.player_action ??= "";
	v.new_action = ""; // If we want to set a new player action, we put it here first so we can update the counter and record the time.
	
	v.last_attack_time ??= 0;
	v.attack = v.attack_time > 0 && (v.last_attack_time == 0 || v.attack_time < v.last_attack_time);
	v.last_attack_time = v.attack_time;
}
export function playerRenderingControls() {
	if(v.attack) {
		if($[toggleRendering]) {
			v.new_action = "toggle_rendering";
		} else if($[changeOpacity]) {
			if(q.is_sneaking) {
				v.new_action = "decrease_opacity";
			} else {
				v.new_action = "increase_opacity";
			}
		} else if($[toggleTint]) {
			v.new_action = "toggle_tint";
		} else if($[toggleValidating]) {
			v.new_action = "toggle_validating";
		} else if($[changeLayer]) {
			if(q.is_sneaking) {
				v.new_action = "decrease_layer";
			} else {
				v.new_action = "increase_layer";
			}
		} else if($[decreaseLayer]) { // saw some confusion about this, it was meant to be for decreasing layer at the armour stand not remotely by the player, but more options can never hurt. ig it makes it more accessible for players who can't sneak...?
			if(q.is_sneaking) {
				v.new_action = "increase_layer";
			} else {
				v.new_action = "decrease_layer";
			}
		} else if($[changeLayerMode]) {
			v.new_action = "change_layer_mode";
		} else if($[moveHologram]) {
			v.new_action = "move_hologram";
		} else if($[rotateHologram]) {
			if(q.is_sneaking) {
				v.new_action = "rotate_hologram_anticlockwise";
			} else {
				v.new_action = "rotate_hologram_clockwise";
			}
		} else if($[changeStructure]) {
			if(q.is_sneaking) {
				v.new_action = "previous_structure";
			} else {
				v.new_action = "next_structure";
			}
		} else if($[backupHologram]) {
			v.new_action = "backup_hologram";
		}
	}
}
export function playerBroadcastActions() {
	if(v.new_action != "") {
		v.player_action = v.new_action;
		v.new_action = "";
		v.player_action_counter++;
		v.last_player_action_time = q.time_stamp;
	}
	if(q.time_stamp - v.last_player_action_time > 40) { // broadcast nothing after 2 seconds. this is so, if the player does an action a minute ago and it doesn't do anything, the armour stands don't suddenly update when it's broadcasted through temp
		v.player_action = "";
	}
	t.player_action = v.player_action;
	t.player_action_counter = v.player_action_counter;
	
	for(let i = 0; i < $[backupSlotCount]; i++) {
		v.hologram_backup_empty_$[i] ??= true;
		if((t.hologram_backup_empty_$[i] ?? -1) == -1) {
			t.hologram_backup_empty_$[i] = v.hologram_backup_empty_$[i];
			if(!v.hologram_backup_empty_$[i]) {
				t.hologram_backup_$[i] = v.hologram_backup_$[i];
			}
		} else {
			v.hologram_backup_empty_$[i] = t.hologram_backup_empty_$[i];
			if(!t.hologram_backup_empty_$[i]) {
				v.hologram_backup_$[i] = t.hologram_backup_$[i];
			}
		}
	}
}
export function playerFirstPerson() {
	if(!q.is_in_ui && !v.map_face_icon) {
		$[initVariables]
		$[renderingControls]
		$[broadcastActions]
	}
}
export function playerThirdPerson() {
	if(!q.is_in_ui) {
		$[initVariables]
		$[renderingControls]
		$[broadcastActions]
	}
}