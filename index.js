//cool dmca retarded
const Vec3 = require('tera-vec3');

let {DungeonInfo,
	 AQ_BOSS_1,  AQ_BOSS_2
} = require('./boss');

module.exports = function Tera_Guide(mod) {
	let Enabled            =  true, // 总开关
		SendToStream       = false, // true 关闭队长通知, 并将消息发送到聊天[代理]频道
		BossLog            = false,
		debug              = false,
		itemID1            =     1, // 告示牌: 1一般布告栏, 2兴高采烈布告栏, 3狂人布告栏
		itemID2            = 98260, // 战利品: 古龍貝勒古斯的頭 (光柱), 369: 鑽石
		itemID3            =   413, // 采集物: 413调味草
		itemID4            =   445, // 采集物: 445艾普罗
		itemID5            =   513, // 采集物: 513吞食之草
		itemID6            =   912; // 采集物: 912鸵鸟蛋
	// 定义变量
	let hooks              = [],
		job                = -1,
		partyMembers       = [],
		isTank             = false, // 坦克职业
		isHealer           = false, // 补师职业
		whichzone          = null,  // 登陆地区(zone)
		whichmode          = null,  // 副本地图(huntingZoneId)
		whichboss          = null,  // 区域位置(templateId)
		boss_GameID        = null,  // BOSS gameId
		boss_HP            = 0,     // BOSS 血量%
		boss_CurLocation   = {},    // BOSS 坐标
		boss_CurAngle      = 0,     // BOSS 角度
		skillid            = 0,     // BOSS 攻击技能编号
		uid1      = 999999999n,     // 告示牌UID
		uid2      = 899999999n,     // 龙头UID
		uid3      = 799999999n,     // 花朵UID
		curLocation        = {},    // 地面提示 坐标 x y z
		curAngle           = 0,     // 地面提示 角度
		// AQ
		myColor            = null,
		tipMsg             = "";
	// 控制命令
	mod.command.add(["aq"], (arg) => {
		if (!arg) {
			Enabled = !Enabled;
			mod.command.message("AQ Guide " + (Enabled ? "ON" : "OFF"));
		} else {
			switch (arg) {
				case "stream":
				case "st":
					SendToStream = !SendToStream;
					mod.command.message("Stream Mode " + (SendToStream ? "ON" : "OFF"));
					break;
				case "info":
                    mod.command.message("Module Switch: " + Enabled);
					mod.command.message("Stream Mode " + (SendToStream ? "Enabled" : "Disabled"));
					mod.command.message("Zone: " + whichzone);
					mod.command.message("Mode: " + whichmode);
					mod.command.message("Area Location: " + whichboss);
					mod.command.message("bossID: "   + boss_GameID);
					mod.command.message("isTank: "   + isTank);
					mod.command.message("isHealer: " + isHealer);
					mod.command.message("partyMembers: " + partyMembers.length);
					break;
				case "log":
					BossLog = !BossLog;
					mod.command.message("Boss-Log: " + (BossLog ? "ON" : "OFF"));
					break;
				case "debug":
					debug = !debug;
					mod.command.message("debug: " + (debug ? "on" : "off"));
					break;
				default :
					mod.command.message("Invalid parameters!");
					break;
			}
		}
	});
	// 登陆游戏
	mod.game.on('enter_game', () => {
		job = (mod.game.me.templateId -10101) % 100;
		if (job==1 || job==10) {
			isTank = true;
		} else if (job==6 || job==7) {
			isHealer = true;
		} else {
			isTank   = false;
			isHealer = false;
		}
	})
	// 切换场景
	mod.game.me.on('change_zone', (zone, quick) => {
		whichzone = zone;
		var dungeonInfo = DungeonInfo.find(obj => obj.zone == zone);
		if (dungeonInfo) {
			mod.command.message(dungeonInfo.string);
			load();
		} else {
			unload();
		}
	})
	
	mod.hook('S_PARTY_MEMBER_LIST', 9, (event) => {
		partyMembers = event.members;
	})
	
	mod.hook('S_LEAVE_PARTY_MEMBER', 2, (event) => {
		partyMembers = partyMembers.filter(obj => obj.name != event.name);
	})
	
	mod.hook('S_LEAVE_PARTY', 1, (event) => {
		partyMembers = [];
	})
	
	function load() {
		if (!hooks.length) {
			hook('S_BOSS_GAGE_INFO',        3, sBossGageInfo);
			hook('S_SPAWN_NPC',            12, sSpawnNpc);
			hook('S_SPAWN_PROJECTILE',      5, sSpawnProjectile);
			hook('S_QUEST_BALLOON',         1, sQuestBalloon);
			hook('S_ABNORMALITY_BEGIN',     4, UpdateAbnormality);
			hook('S_ABNORMALITY_REFRESH',   2, UpdateAbnormality);
			hook('S_ABNORMALITY_END',       1, sAbnormalityEnd);
			hook('S_ACTION_STAGE',          9, sActionStage);
		}
	}
	
	function hook() {
		hooks.push(mod.hook(...arguments));
	}
	
	function unload() {
		if (hooks.length) {
			for (let h of hooks) {
				mod.unhook(h);
			}
			hooks = [];
		}
		reset();
		whichmode = null;
	}
	
	function reset() {
		// 清除所有定时器
		mod.clearAllTimeouts();
		// 清除BOSS信息
		whichboss          = null;
		boss_GameID        = null;
		// AQ_1王
		myColor            = null;
		tipMsg             = "";
	}
	
	function sBossGageInfo(event) {
		boss_HP = (Number(event.curHp) / Number(event.maxHp));
		if (!whichmode) whichmode = event.huntingZoneId;
		if (!whichboss) whichboss = event.templateId;
		if (!boss_GameID) boss_GameID = event.id;
		if (boss_HP <= 0 || boss_HP == 1) reset();
	}
	
	function sSpawnNpc(event) {
		if (!Enabled || SendToStream) return;
		
		if (BossLog && partyMembers.find(obj => obj.gameId != event.owner)) {
			mod.command.message("Spawn-Npc: [" + event.huntingZoneId + "] " + event.templateId);
		}
		// 移除 恶灵岛上级                             1号门   2号门   3号门
		if ([459, 759].includes(event.huntingZoneId) && [2003, 200,210, 211].includes(event.templateId)) return false;
		/* 
		const boxTempIds = [
			//      1      2      3      4      5      6
			      75953, 75955, 75957, 75959, 75961, 75963,
			75941,                                         75942, // 1
			75943,                                         75944, // 2
			75945,                                         75946, // 3
			75947,                                         75948, // 4
			75949,                                         75950, // 5
			75951,                                         75952, // 6
			      75954, 75956, 75958, 75960, 75962, 75964
			-------------------------- 入口 --------------------------
		];
		 */
		
	}
	
	function sSpawnProjectile(event) {
		if ([459, 759].includes(whichmode) && event.templateId==1003 && event.skill.id==3107) {
			boss_CurLocation = event.dest;
			SpawnThing(true, 4000, 0, 0);
		}
	}
	
	function sCreatureRotate(event) {
		// AA_3王 后砸
		if (lastTwoUpDate && boss_GameID==event.gameId) {
			lastRotationDate = Date.now();
			rotationDelay = event.time;
		}
	}
	
	function sQuestBalloon(event) {
		if (!Enabled || !whichmode || !whichboss) return;
		// var msg_Id = parseInt(event.message.replace('@monsterBehavior:', '') % 1000);
		// var msg_Id = parseInt(event.message.replace(/[^0-9]/ig, '') % 1000);
		var msg_Id = parseInt(event.message.match(/\d+/ig)) % 1000;
		if (BossLog) mod.command.message("Q-Balloon: " + event.message + " | " + msg_Id);
		
		// DW_2王 轮盘选中球的颜色(王的说话)
		if (whichmode==466 && whichboss==46602) {
			// 逆-466054 [红色] 顺-466050 | 逆-466055 [白色] 顺-466051 | 逆-466056 [蓝色] 顺-466052
			if ([50, 51, 52, 54, 55, 56].includes(msg_Id)) {
			//    1   2   3   5   6   7
				ballColor = msg_Id % 49;
				sendMessage((DW_TipMsg2[0] + DW_TipMsg2[ballColor]), 25);
			}
		}
		// FI_1王 
		if ([459, 759].includes(whichmode) && [1001, 1004].includes(whichboss)) {
			// 459015 谁要被我诅咒看看吗(伯恩斯坦的诅咒)
			if (msg_Id==15) sendMessage(FI_TipMsg[0], 25);
			// 459021 有人撑不住我的诅咒(拉道斯的诅咒)
			if (msg_Id==21) sendMessage(FI_TipMsg[1], 25);
		}
		// FI_2王 
		if ([459, 759].includes(whichmode) && [1002, 1005].includes(whichboss)) {
			// 459022 亡灵会暂时醒来
			if (msg_Id==22) sendMessage(FI_TipMsg[2], 25);
		}
		// VS_3王 鉴定
		if ([781, 981].includes(whichmode) && whichboss==3000) {
			// 死于混乱之中吧(开始鉴定) - 78142
			if (msg_Id==142) {
				checked = true;
				mod.setTimeout(() => { checked = false; }, 1000);
				
				if (boss_HP > 0.5) {
					nextMsg = nextMsg+1;
					if (!inverted && nextMsg>3) nextMsg = 1; // VS_TipMsg[1] - VS_TipMsg[2] - VS_TipMsg[3]
					if ( inverted && nextMsg>6) nextMsg = 4; // VS_TipMsg[4] - VS_TipMsg[5] - VS_TipMsg[6]
				} else {
					nextMsg = nextMsg-1;
					if (!inverted && nextMsg<1) nextMsg = 3; // 1注(近)-2闪(分)-3炸(解)
					if ( inverted && nextMsg<4) nextMsg = 6; // 4注(远)-5闪(集)-6炸(不)
				}
				mod.setTimeout(() => {
					sendMessage((VS_TipMsg[0] + VS_TipMsg[nextMsg]), 25);
				}, 5000);
			}
			// 进入灵魂 - 78151
			if (msg_Id==151) {
				inverted = true;
				nextMsg = nextMsg+3;
				sendMessage(("Into -> " + VS_TipMsg[nextMsg]), 25);
			}
			// 挺能撑的 - 78152
			if (msg_Id==152) {
				inverted = false;
				nextMsg = nextMsg-3;
				sendMessage(("Out  -> " + VS_TipMsg[nextMsg]), 25);
			}
			// 在神的面前不要掉以轻心 - 78155
		}
	}
	
	function UpdateAbnormality(event) {
		if (!mod.game.me.is(event.target)) return;
		// AQ_1王 内外圈-鉴定 紅色詛咒氣息 藍色詛咒氣息
		if (whichmode==3023 && whichboss==1000 && (event.id==30231000||event.id==30231001)) {
			myColor = event.id;
		}
	}
	
	function sAbnormalityEnd(event) {
		if (!mod.game.me.is(event.target)) return;
		// AQ_1王 内外圈-鉴定
		if (whichmode==3023 && whichboss==1000 && (event.id==30231000||event.id==30231001)) {
			myColor = null;
		}
	}
	
	function sActionStage(event) {
		// 模块关闭 或 不在副本中 或 找不到BOSS血条
		if (!Enabled || !whichmode || !whichboss) return;
		
		
		if (whichboss != event.templateId) return;
		
		if (BossLog) {
			mod.command.message("Boss-Skill: [" + whichmode + "] " + event.templateId + " - " + event.skill.id + "_" + event.stage);
		}
		
		skillid = event.skill.id % 1000;     // 愤怒简化 取1000余数运算
		boss_CurLocation = event.loc;        // BOSS的 x y z 坐标
		boss_CurAngle = event.w;             // BOSS的角度
		curLocation = boss_CurLocation;      // 传递BOSS坐标参数
		curAngle = boss_CurAngle;            // 传递BOSS角度参数
		
		var bossSkillID;
		
		// AQ_Boss1
		if (whichmode==3023 && event.templateId==1000) {
			if (event.stage!=0 || !(bossSkillID = AQ_BOSS_1.find(obj => obj.id==event.skill.id))) return;
			// Front Stun
			if (event.skill.id==1110||event.skill.id==2110) {
				SpawnThing(   false,  100, 180, 180);
				SpawnCircle(itemID3, 3000,  10, 220);
			}
			// Slashs
			if ([1111,2111, 1113,2113, 1112,2112, 1114,2114].includes(event.skill.id)) {
				if ([1111,2111, 1113,2113].includes(event.skill.id)) SpawnThing(false, 100, 270, 180); // 左拉
				if ([1112,2112, 1114,2114].includes(event.skill.id)) SpawnThing(false, 100,  90, 180); // 右拉
				SpawnString(itemID3, 2000, 180, 280);
				SpawnString(itemID3, 2000,   0, 500);
				
				if ([1111,2111, 1113,2113].includes(event.skill.id)) SpawnThing(false, 100,  90, 20); // 左拉
				if ([1112,2112, 1114,2114].includes(event.skill.id)) SpawnThing(false, 100, 270, 20); // 右拉
				SpawnString(itemID3, 2000, 180, 280);
				SpawnString(itemID3, 2000,   0, 500);
			}
			// Backslash
			if (event.skill.id==1115||event.skill.id==2115) {
				Half_Circle(itemID3, 2000, 20, 160);
				Half_Circle(itemID3, 2000, 12, 220);
				Half_Circle(itemID3, 2000, 10, 300);
			}
			// Begone
			if (event.skill.id==3107) {
				SpawnThing(   false,  100,  90,   60);
				SpawnString(itemID3, 2000, 170, 1000);
				SpawnThing(   false,  100, 270,   60);
				SpawnString(itemID3, 2000, 190, 1000);
			}
			// Spin
			if (event.skill.id==3115) {
				SpawnCircle(itemID3, 3000, 8, 320);
			}
			if (event.skill.id==3116) {
				mod.setTimeout(() => { SpawnCircle(itemID3, 3000, 8, 320); }, 2000);
			}
			// Debuff
			if (myColor && (event.skill.id==3119||event.skill.id==3220)) {
				tipMsg = bossSkillID.TIP[myColor%30231000];
			} else {
				tipMsg = "";
			}
			sendMessage(bossSkillID.msg + tipMsg);
		}
		// AQ_Boss2
		if (whichmode==3023 && event.templateId==2000) {
			if (event.stage!=0 || !(bossSkillID = AQ_BOSS_2.find(obj => obj.id==skillid))) return;
			// 插地板
			if (skillid==181) {
				SpawnThing(   false,  100,  90,   60);
				SpawnString(itemID3, 3000, 170, 1000);
				SpawnThing(   false,  100, 270,   60);
				SpawnString(itemID3, 3000, 190, 1000);
			}
			// 后退 | 前搓
			if (skillid==202) {
				SpawnThing(   false,  100,  90,  90);
				SpawnString(itemID3, 3000,   0, 500);
				SpawnString(itemID3, 3000, 180, 500);
				SpawnThing(   false,  100, 270,  90);
				SpawnString(itemID3, 3000,   0, 500);
				SpawnString(itemID3, 3000, 180, 500);
			}
			sendMessage(bossSkillID.msg);
		}
		
	}
	// 发送提示文字
	function sendMessage(msg, chl) {
		if (SendToStream) {
			mod.command.message(msg);
		} else {
			mod.send('S_CHAT', 3 , {
				channel: chl ? chl : 21, // 21 = 队长通知, 1 = 组队, 2 = 公会, 25 = 团长通知
				name: 'DG-Guide',
				message: msg
			});
		}
	}
	// 地面提示(光柱+告示牌)
	function SpawnThing(show, times, degrees, radius) {          // 是否显示 持续时间 偏移角度 半径距离
		if (SendToStream) return;
	
		var r = null, rads = null, finalrad = null, spawnx = null, spawny = null;
		r = boss_CurAngle - Math.PI;
		rads = (degrees * Math.PI/180);
		finalrad = r - rads;
		spawnx = boss_CurLocation.x + radius * Math.cos(finalrad);
		spawny = boss_CurLocation.y + radius * Math.sin(finalrad);
		
		curLocation = new Vec3(spawnx, spawny, curLocation.z);
		curAngle = boss_CurAngle;
		
		if (!show) return;
		// 告示牌
		mod.send('S_SPAWN_BUILD_OBJECT', 2, {
			gameId : uid1,
			itemId : itemID1,
			loc : curLocation,
			w : isTank ? boss_CurAngle : r,
			ownerName : "TIP",
			message : "TIP"
		});
		// 龙头光柱
		// curLocation.z = curLocation.z - 100;
		mod.send('S_SPAWN_DROPITEM', 8, {
			gameId: uid2,
			loc: curLocation,
			item: itemID2, // 98260-古龙贝勒古斯的头
			amount: 1,
			expiry: 600000
		});
		// curLocation.z = curLocation.z + 100;
		// 延迟消除
		setTimeout(DespawnThing, times, uid1, uid2);
		uid1--;
		uid2--;
	}
	// 消除 光柱+告示牌
	function DespawnThing(uid_arg1, uid_arg2) {
		mod.send('S_DESPAWN_BUILD_OBJECT', 2, {
			gameId : uid_arg1
		});
		mod.send('S_DESPAWN_DROPITEM', 4, {
			gameId: uid_arg2
		});
	}
	// 地面提示(花朵)
	function SpawnItem(item, times, degrees, radius) {           // 显示物品 持续时间 偏移角度 半径距离
		if (SendToStream) return;
		
		var r = null, rads = null, finalrad = null, spawnx = null, spawny = null;
		r = curAngle - Math.PI;
		rads = (degrees * Math.PI/180);
		finalrad = r - rads;
		spawnx = curLocation.x + radius *Math.cos(finalrad);
		spawny = curLocation.y + radius *Math.sin(finalrad);
		// 花朵
		mod.send('S_SPAWN_COLLECTION', 4, {
			gameId : uid3,
			id : item,
			amount : 1,
			loc : new Vec3(spawnx, spawny, curLocation.z),
			w : r
		});
		// 延时消除
		setTimeout(Despawn, times, uid3);
		uid3--;
	}
	// 消除 花朵
	function Despawn(uid_arg3) {
		mod.send('S_DESPAWN_COLLECTION', 2, {
			gameId : uid_arg3
		});
	}
	// 构造 直线花朵
	function SpawnString(item, times, degrees, maxRadius) {      // 显示物品 持续时间 偏移角度 最远距离
		for (var radius=50; radius<=maxRadius; radius+=50) {     // 默认间隔 50
			SpawnItem(item, times, degrees, radius);
		}
	}
	// 构造 圆形花圈
	function SpawnCircle(item, times, intervalDegrees, radius) { // 显示物品 持续时间 偏移间隔 半径距离
		for (var degrees=0; degrees<360; degrees+=intervalDegrees) {
			SpawnItem(item, times, degrees, radius);
		}
	}
	// 构造 后方 半圆形 花圈
	function Half_Circle(item, times, intervalDegrees, radius) { // 显示物品 持续时间 偏移间隔 半径距离
		for (var degrees=0; degrees<360; degrees+=intervalDegrees) {
			if (90<degrees && degrees<270) continue;
			SpawnItem(item, times, degrees, radius);
		}
	}
	
	mod.hook('C_PLAYER_LOCATION', 5, event => {
		if (!debug) return;
		boss_CurLocation = event.loc;
		boss_CurAngle = event.w;
		curLocation = event.loc;
		curAngle = event.w;
	});
	mod.command.add("点", (a1, a2, a3, a4) => {
		Number(a1), Number(a2), Number(a3), Number(a4);
		SpawnThing(a1, a2, a3, a4);
	});
	mod.command.add("线", (b1, b2, b3, b4) => {
		Number(b1), Number(b2), Number(b3), Number(b4);
		SpawnString(b1, b2, b3, b4);
	});
	mod.command.add("圆", (c1, c2, c3) => {
		Number(c1), Number(c2), Number(c3);
		SpawnCircle(c1, c2, 10, c3);
	});
	mod.command.add("半圆", (d1, d2, d3) => {
		Number(d1), Number(d2), Number(d3);
		Half_Circle(d1, d2, 10, d3);
	});
}
