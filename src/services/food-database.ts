// 食物标准数据库，随时补充/修正，不需要动任何 prompt 文件

export interface FoodDecompose {
  name: string
  ratio: number      // 占总重量的比例
  protein: number    // per 100g
  carbs: number      // per 100g
  fat: number        // per 100g
}

export interface FoodEntry {
  aliases: string[]
  defaultGrams: number
  unit: string
  protein: number    // per 100g（无 decompose 时使用）
  carbs: number
  fat: number
  /** true = per100g 口径为生重/干重；false = 直接可食用（熟食/即食） */
  isRawWeight: boolean
  /**
   * 生重 -> 熟重（可食用状态）的重量倍率（熟重/生重）。
   * 例：干粉丝 50g 泡发后约 100g，则 cookedPerRawRatio = 2。
   * 未提供时可由 LLM 估算并缓存。
   */
  cookedPerRawRatio?: number
  perPieceGrams?: number
  decompose?: FoodDecompose[]
  note?: string
}

export const FOOD_DATABASE: Record<string, FoodEntry> = {

  // ─── 饮品 ────────────────────────────────────────────────
  'americano': {
    aliases: ['美式', '美式咖啡', '黑咖啡', '咖啡', '瑞幸咖啡', '瑞幸美式', '手冲咖啡'],
    defaultGrams: 250, unit: '杯',
    protein: 0, carbs: 0, fat: 0,
    isRawWeight: false,
    note: '未加糖奶时 P/C/F 均为 0'
  },
  'latte': {
    aliases: ['拿铁', '咖啡加奶', '咖啡加牛奶', '牛奶咖啡'],
    defaultGrams: 250, unit: '杯',
    protein: 1.2, carbs: 2, fat: 1.2,
    isRawWeight: false,
    note: '按 80g 全脂牛奶 + 170g 咖啡估算'
  },
  'milk': {
    aliases: ['牛奶', '全脂牛奶', '纯牛奶'],
    defaultGrams: 250, unit: '杯',
    protein: 3.2, carbs: 4.8, fat: 3.2,
    isRawWeight: false,
  },
  'soy-milk': {
    aliases: ['豆浆', '无糖豆浆'],
    defaultGrams: 250, unit: '杯',
    protein: 3, carbs: 1.5, fat: 1.6,
    isRawWeight: false,
  },

  // ─── 面食 ────────────────────────────────────────────────
  'lanzhou-noodle': {
    aliases: ['兰州拉面', '牛肉面', '拉面', '兰州牛肉面'],
    defaultGrams: 380, unit: '碗',
    protein: 8, carbs: 18, fat: 2,
    isRawWeight: false,
    decompose: [
      { name: '拉面（熟）', ratio: 0.79, protein: 4,  carbs: 23, fat: 0.5 },
      { name: '牛肉片',     ratio: 0.21, protein: 20, carbs: 0,  fat: 7   },
    ],
    note: '面条约 300g 熟重 + 牛肉约 80g'
  },
  'rice-noodle': {
    aliases: ['米线', '云南米线', '过桥米线', '云阿蛮米线'],
    defaultGrams: 380, unit: '碗',
    protein: 7, carbs: 17, fat: 3,
    isRawWeight: false,
    decompose: [
      { name: '米线（熟）', ratio: 0.79, protein: 2,  carbs: 21, fat: 0.3 },
      { name: '肉臊/牛肉',  ratio: 0.21, protein: 18, carbs: 1,  fat: 10  },
    ],
    note: '米线约 300g 熟重'
  },

  // ─── 主食 ────────────────────────────────────────────────
  'steamed-rice': {
    aliases: ['米饭', '白米饭', '大米饭'],
    defaultGrams: 175, unit: '碗',
    protein: 2.6, carbs: 26, fat: 0.3,
    isRawWeight: false,
  },
  'mixed-grain-rice': {
    aliases: ['杂粮饭', '糙米饭', '五谷饭', '粗粮饭'],
    defaultGrams: 175, unit: '碗',
    protein: 3.5, carbs: 23, fat: 0.8,
    isRawWeight: false,
  },
  'quinoa': {
    aliases: ['藜麦', '藜麦饭', '即食藜麦'],
    defaultGrams: 175, unit: '份',
    protein: 4, carbs: 20, fat: 1.5,
    isRawWeight: false,
  },
  'oatmeal': {
    aliases: ['燕麦', '燕麦粥', '即食燕麦'],
    defaultGrams: 200, unit: '碗',
    protein: 5, carbs: 22, fat: 3,
    isRawWeight: false,
    note: '加水冲泡后熟重'
  },

  // ─── 点心 / 带馅面食（必须拆解）────────────────────────────
  'xiaolongbao': {
    aliases: ['小笼包', '小笼', '灌汤包'],
    defaultGrams: 200, unit: '笼（8个）',
    perPieceGrams: 25,
    protein: 8, carbs: 10, fat: 4,
    isRawWeight: false,
    decompose: [
      { name: '小笼包面皮', ratio: 0.6, protein: 3,  carbs: 18, fat: 0.5 },
      { name: '猪肉馅',     ratio: 0.4, protein: 16, carbs: 1,  fat: 10  },
    ],
    note: '一笼按 8 个 / 200g 熟重'
  },
  'dumpling': {
    aliases: ['饺子', '水饺', '煮饺子'],
    defaultGrams: 180, unit: '份（约10个）',
    perPieceGrams: 18,
    protein: 7, carbs: 14, fat: 4,
    isRawWeight: false,
    decompose: [
      { name: '饺子皮', ratio: 0.56, protein: 3,  carbs: 22, fat: 0.5 },
      { name: '猪肉馅', ratio: 0.44, protein: 12, carbs: 2,  fat: 9   },
    ],
  },
  'pan-fried-dumpling': {
    aliases: ['锅贴', '煎饺'],
    defaultGrams: 180, unit: '份（约8个）',
    perPieceGrams: 22,
    protein: 7, carbs: 14, fat: 6,
    isRawWeight: false,
    decompose: [
      { name: '锅贴皮', ratio: 0.56, protein: 3,  carbs: 22, fat: 0.5 },
      { name: '猪肉馅', ratio: 0.44, protein: 12, carbs: 2,  fat: 11  },
    ],
    note: '煎制，脂肪略高于水饺'
  },
  'baozi': {
    aliases: ['包子', '肉包', '肉包子'],
    defaultGrams: 100, unit: '个',
    perPieceGrams: 100,
    protein: 7, carbs: 20, fat: 5,
    isRawWeight: false,
    decompose: [
      { name: '包子皮', ratio: 0.6, protein: 3,  carbs: 30, fat: 0.5 },
      { name: '猪肉馅', ratio: 0.4, protein: 14, carbs: 3,  fat: 11  },
    ],
  },

  // ─── 蛋白质类 ────────────────────────────────────────────
  'chicken-breast': {
    aliases: ['鸡胸肉', '鸡胸', '即食鸡胸', '白水鸡胸'],
    defaultGrams: 150, unit: '份',
    protein: 22, carbs: 0, fat: 2,
    isRawWeight: false,
  },
  'egg': {
    aliases: ['鸡蛋', '水煮蛋', '煮鸡蛋', '全蛋'],
    defaultGrams: 55, unit: '个',
    perPieceGrams: 55,
    protein: 13, carbs: 1.1, fat: 9,
    isRawWeight: false,
  },
  'salmon': {
    aliases: ['三文鱼', '三文鱼片', '烟熏三文鱼'],
    defaultGrams: 150, unit: '份',
    protein: 20, carbs: 0, fat: 8,
    isRawWeight: false,
  },
  'tofu': {
    aliases: ['豆腐', '嫩豆腐', '老豆腐', '北豆腐'],
    defaultGrams: 150, unit: '份',
    protein: 8, carbs: 2, fat: 4,
    isRawWeight: false,
  },
  'greek-yogurt': {
    aliases: ['希腊酸奶', '希腊yogurt', '高蛋白酸奶'],
    defaultGrams: 150, unit: '份',
    protein: 10, carbs: 6, fat: 0.5,
    isRawWeight: false,
  },

  // ─── 水果 ────────────────────────────────────────────────
  'banana': {
    aliases: ['香蕉'],
    defaultGrams: 100, unit: '根',
    perPieceGrams: 100,
    protein: 1.1, carbs: 23, fat: 0.3,
    isRawWeight: false,
  },
  'apple': {
    aliases: ['苹果'],
    defaultGrams: 200, unit: '个',
    perPieceGrams: 200,
    protein: 0.3, carbs: 14, fat: 0.2,
    isRawWeight: false,
  },
  'blueberry': {
    aliases: ['蓝莓'],
    defaultGrams: 100, unit: '份',
    protein: 0.7, carbs: 14, fat: 0.3,
    isRawWeight: false,
  },

  // ─── 外卖品牌 ────────────────────────────────────────────
  'super-bowl': {
    aliases: ['超级碗', '超级碗标准份'],
    defaultGrams: 450, unit: '份',
    protein: 12, carbs: 18, fat: 4,
    isRawWeight: false,
    decompose: [
      { name: '谷物饭底',   ratio: 0.44, protein: 3,  carbs: 30, fat: 0.5 },
      { name: '蛋白质主料', ratio: 0.33, protein: 22, carbs: 0,  fat: 4   },
      { name: '混合蔬菜',   ratio: 0.22, protein: 2,  carbs: 5,  fat: 0.5 },
    ],
    note: '蛋白质主料默认按鸡胸肉计算，若用户指定其他蛋白质请调整'
  },
  'family-mart-onigiri': {
    aliases: ['全家饭团', '饭团'],
    defaultGrams: 130, unit: '个',
    perPieceGrams: 130,
    protein: 4, carbs: 28, fat: 2,
    isRawWeight: false,
    note: '按全家标准饭团估算'
  },

  // ─── 饿梨酱（Olu's Bowl）外卖数据（宏量按热量与食物类型推算，待店内核实） ─────────────────
  // 数据来源：外卖平台官方热量表；官方未提供处在 note 中标注待核实
  // ─── 蛋白质 ────────────────────────────────────────────────
  'olus-slow-pork': {
    aliases: ['慢炖小猪猪', '饿梨酱慢炖猪'],
    defaultGrams: 113, unit: '份',
    protein: 22, carbs: 2, fat: 9, // 210kcal 推算
    isRawWeight: false,
    note: '饿梨酱官方 210kcal/113g，P/C/F 待店内核实',
  },
  'olus-slow-beef': {
    aliases: ['慢炖小牛牛', '饿梨酱慢炖牛'],
    defaultGrams: 113, unit: '份',
    protein: 26, carbs: 0, fat: 6, // 170kcal 推算
    isRawWeight: false,
    note: '饿梨酱官方 170kcal/113g，P/C/F 待店内核实',
  },
  'olus-grilled-beef': {
    aliases: ['炙烤牛排', '饿梨酱炙烤牛排'],
    defaultGrams: 113, unit: '份',
    protein: 26, carbs: 0, fat: 5, // 150kcal 推算
    isRawWeight: false,
    note: '饿梨酱官方 150kcal/113g，P/C/F 待店内核实',
  },
  'olus-grilled-chicken': {
    aliases: ['炙烤鸡腿排', '饿梨酱炙烤鸡腿'],
    defaultGrams: 113, unit: '份',
    protein: 28, carbs: 0, fat: 8, // 180kcal 推算
    isRawWeight: false,
    note: '饿梨酱官方 180kcal/113g，P/C/F 待店内核实（⭐建议补精确 P/C/F）',
  },
  'olus-spicy-pork': {
    aliases: ['墨式酸辣小肉', '饿梨酱酸辣猪肉'],
    defaultGrams: 113, unit: '份',
    protein: 22, carbs: 2, fat: 9, // 210kcal 推算
    isRawWeight: false,
    note: '饿梨酱官方 210kcal/113g，P/C/F 待店内核实',
  },
  'olus-tofu': {
    aliases: ['墨式文火豆腐', '饿梨酱豆腐'],
    defaultGrams: 113, unit: '份',
    protein: 10, carbs: 6, fat: 8, // 150kcal 推算
    isRawWeight: false,
    note: '饿梨酱官方 150kcal/113g，P/C/F 待店内核实',
  },

  // ─── 主食 ────────────────────────────────────────────────
  'olus-cilantro-white-rice': {
    aliases: ['香菜青柠白米', '饿梨酱白米'],
    defaultGrams: 130, unit: '份',
    protein: 2.3, carbs: 23, fat: 1.5, // 146kcal/100g 推算
    isRawWeight: false,
    note: '饿梨酱官方 190kcal/130g',
  },
  'olus-cilantro-brown-rice': {
    aliases: ['香菜青柠糙米', '饿梨酱糙米'],
    defaultGrams: 130, unit: '份',
    protein: 3, carbs: 22, fat: 2, // 146kcal/100g 推算
    isRawWeight: false,
    note: '饿梨酱官方 190kcal/130g',
  },
  'olus-garlic-butter-rice': {
    aliases: ['蒜香黄油饭', '饿梨酱黄油饭'],
    defaultGrams: 130, unit: '份',
    protein: 2, carbs: 22, fat: 5, // 162kcal/100g 推算，黄油脂肪偏高
    isRawWeight: false,
    note: '饿梨酱官方 210kcal/130g',
  },
  'olus-mashed-potato': {
    aliases: ['土豆泥', '饿梨酱土豆泥'],
    defaultGrams: 130, unit: '份',
    protein: 1.5, carbs: 14, fat: 2.5, // 92kcal/100g 推算，含黄油
    isRawWeight: false,
    note: '饿梨酱官方 120kcal/130g，是否含黄油待核实（⭐）',
  },
  'olus-burrito': {
    aliases: ['卷饼', '饿梨酱卷饼'],
    defaultGrams: 104, unit: '份',
    protein: 8, carbs: 52, fat: 8, // 305kcal/100g 推算
    isRawWeight: false,
    note: '饿梨酱官方 317kcal/104g，按墨西哥卷饼估算',
  },

  // ─── 配菜 ────────────────────────────────────────────────
  'olus-vegetables': {
    aliases: ['时蔬法嘿塔', '饿梨酱时蔬'],
    defaultGrams: 70, unit: '份',
    protein: 1, carbs: 3, fat: 0,
    isRawWeight: false,
    note: '饿梨酱官方 20kcal/70g',
  },
  'olus-black-beans': {
    aliases: ['黑豆', '饿梨酱黑豆'],
    defaultGrams: 50, unit: '份',
    protein: 4, carbs: 9, fat: 0.5,
    isRawWeight: false,
    note: '饿梨酱官方 60kcal/50g',
  },
  'olus-tomato-salsa': {
    aliases: ['番茄莎莎', '饿梨酱番茄莎莎'],
    defaultGrams: 70, unit: '份',
    protein: 0.5, carbs: 4, fat: 0,
    isRawWeight: false,
    note: '饿梨酱官方 20kcal/70g',
  },
  'olus-corn-salsa': {
    aliases: ['玉米莎莎', '饿梨酱玉米莎莎'],
    defaultGrams: 70, unit: '份',
    protein: 2, carbs: 13, fat: 0.5,
    isRawWeight: false,
    note: '饿梨酱官方 60kcal/70g',
  },
  'olus-romaine': {
    aliases: ['罗马生菜', '饿梨酱生菜'],
    defaultGrams: 40, unit: '份',
    protein: 0.5, carbs: 1, fat: 0,
    isRawWeight: false,
    note: '饿梨酱官方 5kcal/40g',
  },
  'olus-pickled-jalapeno': {
    aliases: ['腌辣椒圈', '饿梨酱辣椒圈'],
    defaultGrams: 20, unit: '份',
    protein: 0, carbs: 1, fat: 0,
    isRawWeight: false,
    note: '饿梨酱官方 5kcal/20g',
  },

  // ─── 酱料 ────────────────────────────────────────────────
  // ⚠️ 以下酱料官方未提供克数（部分），P/C/F 待店内核实
  'olus-avocado-sauce': {
    aliases: ['招牌鳄梨酱', '饿梨酱鳄梨酱'],
    defaultGrams: 40, unit: '份', // 克数未知，按常见酱料份量估 40g
    protein: 1, carbs: 3, fat: 14, // 170kcal 推算
    isRawWeight: false,
    note: '饿梨酱官方 170kcal/份，克数未知待核实（⭐）',
  },
  'olus-spicy-sauce': {
    aliases: ['秘制酸辣酱', '饿梨酱酸辣酱'],
    defaultGrams: 30, unit: '份',
    protein: 0.5, carbs: 4, fat: 0.5,
    isRawWeight: false,
    note: '饿梨酱官方 20kcal/30g',
  },
  'olus-sriracha-cream': {
    aliases: ['是拉差奶油酱', '饿梨酱奶油酱'],
    defaultGrams: 30, unit: '份', // 克数未知，待核实
    protein: 0.5, carbs: 3, fat: 8, // 90kcal 推算
    isRawWeight: false,
    note: '饿梨酱官方 90kcal/份，克数未知待核实（⭐）',
  },
  'olus-cilantro-lime-sauce': {
    aliases: ['香菜青柠酱', '饿梨酱青柠酱'],
    defaultGrams: 28, unit: '份',
    protein: 0.5, carbs: 4, fat: 9, // 110kcal/28g 推算
    isRawWeight: false,
    note: '饿梨酱官方 110kcal/28g',
  },
  'olus-yogurt-sauce': {
    aliases: ['清新酸奶酱', '饿梨酱酸奶酱'],
    defaultGrams: 56, unit: '份',
    protein: 2, carbs: 8, fat: 8, // 120kcal/56g 推算
    isRawWeight: false,
    note: '饿梨酱官方 120kcal/56g',
  },
  'olus-cheese': {
    aliases: ['芝士碎', '饿梨酱芝士'],
    defaultGrams: 20, unit: '份',
    protein: 4, carbs: 0.5, fat: 6, // 80kcal/20g 推算
    isRawWeight: false,
    note: '饿梨酱官方 80kcal/20g',
  },

  // ─── 主食/干货（per100g 生重/干重） ─────────────────────────────
  'rice-dry': {
    aliases: ['大米', '白米', '粳米'],
    defaultGrams: 75, unit: '份（干）',
    protein: 7.4, carbs: 77, fat: 0.8,
    isRawWeight: true,
    cookedPerRawRatio: 2.7,
  },
  'oat-dry': {
    aliases: ['燕麦', '燕麦片', '即食燕麦'],
    defaultGrams: 50, unit: '份（干）',
    protein: 13.1, carbs: 67, fat: 6.9,
    isRawWeight: true,
    cookedPerRawRatio: 2.5,
  },
  'sweet-potato': {
    aliases: ['红薯', '番薯', '地瓜'],
    defaultGrams: 150, unit: '个',
    protein: 1.1, carbs: 24, fat: 0.2,
    isRawWeight: true,
    cookedPerRawRatio: 0.9,
  },
  'nanju-rice-noodle': {
    aliases: ['南巨米粉', '米粉（干）'],
    defaultGrams: 30, unit: '份（干）',
    protein: 7, carbs: 80, fat: 0.5,
    isRawWeight: true,
    cookedPerRawRatio: 2.3,
  },
  'longkou-vermicelli': {
    aliases: ['龙口粉丝', '粉丝'],
    defaultGrams: 50, unit: '份（干）',
    protein: 0.5, carbs: 86, fat: 0.1,
    isRawWeight: true,
    cookedPerRawRatio: 2.0,
    note: '干粉丝口径；泡发倍率因做法不同可在 2~3 之间',
  },
  'bread-whole-wheat': {
    aliases: ['全麦面包', '全麦吐司'],
    defaultGrams: 60, unit: '片（2片）',
    protein: 8, carbs: 41, fat: 3.5,
    isRawWeight: false,
  },

  // ─── 蛋白质（per100g 生重/原重） ─────────────────────────────
  'chicken-breast-raw': {
    aliases: ['鸡胸肉', '鸡胸', '生鸡胸'],
    defaultGrams: 150, unit: '份',
    protein: 22, carbs: 0, fat: 2,
    isRawWeight: true,
    cookedPerRawRatio: 0.75,
  },
  'chicken-thigh-raw': {
    aliases: ['鸡腿', '鸡腿肉', '去骨鸡腿'],
    defaultGrams: 150, unit: '份',
    protein: 17, carbs: 0, fat: 8,
    isRawWeight: true,
    cookedPerRawRatio: 0.78,
  },
  'beef-lean': {
    aliases: ['牛肉', '牛里脊', '瘦牛肉'],
    defaultGrams: 150, unit: '份',
    protein: 20, carbs: 0, fat: 4,
    isRawWeight: true,
    cookedPerRawRatio: 0.75,
  },
  'pork-lean': {
    aliases: ['猪肉', '瘦猪肉', '猪里脊'],
    defaultGrams: 150, unit: '份',
    protein: 20, carbs: 0, fat: 6,
    isRawWeight: true,
    cookedPerRawRatio: 0.75,
  },
  'shrimp': {
    aliases: ['虾', '虾仁', '鲜虾'],
    defaultGrams: 150, unit: '份',
    protein: 18, carbs: 0, fat: 1,
    isRawWeight: true,
    cookedPerRawRatio: 0.85,
  },
  'protein-powder': {
    aliases: ['蛋白粉', '康比特蛋白粉', '乳清蛋白'],
    defaultGrams: 30, unit: '勺',
    protein: 80, carbs: 5, fat: 3,
    isRawWeight: false,
  },
  'tofu-soft': {
    aliases: ['豆腐', '嫩豆腐', '软豆腐'],
    defaultGrams: 150, unit: '份',
    protein: 5, carbs: 2, fat: 2.5,
    isRawWeight: false,
  },
  'tofu-firm': {
    aliases: ['老豆腐', '北豆腐', '硬豆腐'],
    defaultGrams: 150, unit: '份',
    protein: 8, carbs: 2, fat: 4,
    isRawWeight: false,
  },

  // ─── 蔬菜（per100g 生重） ───────────────────────────────────
  'broccoli': {
    aliases: ['西兰花', '花椰菜', '绿花椰'],
    defaultGrams: 100, unit: '份',
    protein: 3.7, carbs: 4.9, fat: 0.4,
    isRawWeight: true,
    cookedPerRawRatio: 0.8,
  },
  'spinach': {
    aliases: ['菠菜'],
    defaultGrams: 100, unit: '份',
    protein: 2.9, carbs: 3, fat: 0.4,
    isRawWeight: true,
    cookedPerRawRatio: 0.7,
  },
  'cabbage': {
    aliases: ['白菜', '大白菜'],
    defaultGrams: 100, unit: '份',
    protein: 1.5, carbs: 3, fat: 0.1,
    isRawWeight: true,
    cookedPerRawRatio: 0.85,
  },
  'tomato': {
    aliases: ['西红柿', '番茄'],
    defaultGrams: 150, unit: '个',
    perPieceGrams: 150,
    protein: 0.9, carbs: 3.9, fat: 0.2,
    isRawWeight: true,
    cookedPerRawRatio: 0.95,
  },
  'cucumber': {
    aliases: ['黄瓜'],
    defaultGrams: 150, unit: '根',
    perPieceGrams: 150,
    protein: 0.8, carbs: 3, fat: 0.2,
    isRawWeight: true,
    cookedPerRawRatio: 0.95,
  },

  // ─── 汤品（熟食/可食用） ─────────────────────────────────
  'soup-hulatang-vegetarian': {
    aliases: ['素胡辣汤', '胡辣汤（素）', '胡辣汤(素）'],
    defaultGrams: 450, unit: '碗',
    // 来自你截图的「每 100g」营养：38kcal / P 2.8g / C 2.6g / F 1.9g
    protein: 2.8, carbs: 2.6, fat: 1.9,
    isRawWeight: false,
    note: '素胡辣汤：不含宽粉/粉条/面条/牛肉（按可食用口径）',
  },

  // ─── 面饼/煎饼（熟食/可食用） ─────────────────────────────────
  'egg-pancake': {
    aliases: ['鸡蛋饼'],
    defaultGrams: 180, unit: '份',
    // 来自你截图：每 180g
    // P 13.2g / C 38.2g / F 12.0g，换算每100g：P 7.3 / C 21.2 / F 6.7
    protein: 7.3, carbs: 21.2, fat: 6.7,
    isRawWeight: false,
    note: '鸡蛋饼（按截图营养标签录入）',
  },

  // ─── 坚果/油脂（可直接食用） ─────────────────────────────────
  'mixed-nuts': {
    aliases: ['坚果', '混合坚果'],
    defaultGrams: 15, unit: '份',
    protein: 15, carbs: 15, fat: 55,
    isRawWeight: false,
  },
  'olive-oil': {
    aliases: ['橄榄油', '油'],
    defaultGrams: 10, unit: '勺',
    protein: 0, carbs: 0, fat: 100,
    isRawWeight: false,
  },
}

/**
 * 将数据库转换为注入 prompt 的文本摘要
 */
export const buildDatabaseSummary = (): string => {
  const lines: string[] = ['以下是标准食物数据库，解析时严格按此执行：\n']

  for (const [, entry] of Object.entries(FOOD_DATABASE)) {
    const aliasStr = entry.aliases.join(' / ')
    const baseInfo = `一${entry.unit} = ${entry.defaultGrams}g`

    if (entry.decompose) {
      const decomposeStr = entry.decompose
        .map(d => `${d.name}(${Math.round(d.ratio * entry.defaultGrams)}g)`)
        .join(' + ')
      lines.push(`- [${aliasStr}]：${baseInfo}，必须拆解为 → ${decomposeStr}${entry.note ? `（${entry.note}）` : ''}`)
    } else {
      const macro = `P${entry.protein}/C${entry.carbs}/F${entry.fat} per 100g`
      lines.push(`- [${aliasStr}]：${baseInfo}，${macro}${entry.note ? `（${entry.note}）` : ''}`)
    }

    if (entry.perPieceGrams) {
      lines.push(`  单个约 ${entry.perPieceGrams}g`)
    }
  }

  return lines.join('\n')
}

