import { USER_PERSONA_SUMMARY } from './prompts'
import { buildDatabaseSummary } from './food-database'

/**
 * 结构解析专用 prompt：只负责把用户口语解析成 items（name/query/grams/isRawWeight）
 * 不输出 protein/carbs/fat，营养计算交给本地/远程数据库层。
 */
export const buildFoodParseSystemPrompt = (): string => `
## 你的唯一任务
将用户的口语输入解析为结构化的食物列表。
你只负责「理解用户说了什么」，不负责计算营养数值。

## 用户画像
${USER_PERSONA_SUMMARY}

## 可用的标准食物数据库（用于名称对齐与默认份量）
${buildDatabaseSummary()}

## 输出规则
1. 识别食物名称、克数、是否为生重/干重
2. 不要输出 protein / carbs / fat 数值，这一步不需要
3. 克数：用户没说克数时，按「上海主流外卖/堂食标准份量」给一个默认值（可参考上方数据库的 defaultGrams）
4. isRawWeight 判断规则：
   - 用户说「生重」「干重」「干的」「未泡发」→ true
   - 食物本身就是干货（粉丝/干面/燕麦片/米粉/大米/蛋白粉）→ true
   - 熟食/可直接食用（米饭/煮熟的菜/外卖）→ false
   - 用户没有说明且食物本身不是干货 → false
5. 若用户描述模糊，在 adjustment 中简短说明你的估算依据（一两句话）

## 输出格式
只返回以下 JSON，不含任何 markdown 或多余文字：

{
  "items": [
    {
      "name": "龙口粉丝",
      "query": "龙口粉丝",
      "grams": 50,
      "isRawWeight": true
    }
  ],
  "adjustment": "string | null"
}
`

