import { useState } from 'react'
import { getSignatureRecipe } from '../data/signatureRecipes'
import { INGREDIENT_LIBRARY, suggestAmounts, macrosFromAmounts } from '../data/ingredientLibrary'
import { Check, RefreshCw, ChevronDown } from 'lucide-react'

/**
 * 双模餐卡：招牌模式（固定配方 + 一键打卡） / 灵活模式（食材库多选 + 建议克数 + 确认打卡）
 */
const RICE_CARBS_PER_100 = 28

export function MealCard({
  meal,
  mealIndex,
  isLogged,
  onLog,
  onMealOverride,
}) {
  const [mode, setMode] = useState('signature')
  const [flexSelectedIds, setFlexSelectedIds] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [editingRiceGrams, setEditingRiceGrams] = useState(false)
  const [riceInputValue, setRiceInputValue] = useState('')

  const showRiceEdit = onMealOverride && meal.isPostWorkout && meal.carbs > 0 && !isLogged
  const riceGrams = showRiceEdit ? Math.round(meal.carbs / (RICE_CARBS_PER_100 / 100)) : 0

  const startEditRice = () => {
    setRiceInputValue(String(riceGrams))
    setEditingRiceGrams(true)
  }
  const saveRiceEdit = () => {
    const g = parseInt(riceInputValue, 10)
    if (!Number.isNaN(g) && g >= 0) {
      const newCarbs = Math.round((g * (RICE_CARBS_PER_100 / 100)) * 10) / 10
      onMealOverride(mealIndex, { carbs: newCarbs })
    }
    setEditingRiceGrams(false)
  }

  const recipe = getSignatureRecipe(meal.name)
  const effectiveMode = recipe ? mode : 'flexible'
  const mealTarget = { protein: meal.protein, carbs: meal.carbs, fat: meal.fat }
  const selectedIngredients = flexSelectedIds
    .map((id) => INGREDIENT_LIBRARY.find((i) => i.id === id))
    .filter(Boolean)
  const suggested = suggestAmounts(mealTarget, selectedIngredients)
  const flexibleMacros = suggested.length ? macrosFromAmounts(suggested) : null

  const handleSignatureCheckIn = () => {
    if (recipe && !isLogged) onLog(mealIndex, { protein: meal.protein, carbs: meal.carbs, fat: meal.fat })
  }

  const handleFlexibleCheckIn = () => {
    if (flexibleMacros && suggested.length > 0 && !isLogged) onLog(mealIndex, flexibleMacros)
  }

  const toggleIngredient = (id) => {
    setFlexSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  return (
    <div
      className="rounded-xl border border-[#404040] p-4"
      style={{ backgroundColor: isLogged ? '#2a2a2a' : '#3a3a3a' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-zinc-100">{meal.name}</span>
        <div className="flex flex-wrap justify-end gap-1">
          {meal.isPreWorkout && (
            <span className="rounded bg-zinc-600/80 px-2 py-0.5 text-[11px] text-zinc-300">
              练前
            </span>
          )}
          {meal.isPostWorkout && !meal.isRecoveryFocus && (
            <span className="rounded bg-[#FF3C3C]/20 px-2 py-0.5 text-[11px] text-[#FF3C3C]">
              练后 50% 碳水
            </span>
          )}
          {meal.isRecoveryFocus && (
            <span className="rounded bg-[#FF3C3C]/20 px-2 py-0.5 text-[11px] text-[#FF3C3C]">
              Recovery Focus（侧重修复）
            </span>
          )}
          {isLogged && (
            <span className="rounded bg-green-600/20 px-2 py-0.5 text-[11px] text-green-400">
              已打卡
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 text-[12px] text-zinc-500">
        P {Math.round(meal.protein)}g · C {Math.round(meal.carbs)}g · F {Math.round(meal.fat)}g
      </p>
      {showRiceEdit && (
        <p className="mt-0.5 text-[12px] text-zinc-400">
          熟米饭{' '}
          {editingRiceGrams ? (
            <input
              type="number"
              min={0}
              step={10}
              value={riceInputValue}
              onChange={(e) => setRiceInputValue(e.target.value)}
              onBlur={saveRiceEdit}
              onKeyDown={(e) => e.key === 'Enter' && saveRiceEdit()}
              className="w-14 rounded border border-[#404040] bg-[#2a2a2a] px-1.5 py-0.5 text-zinc-100"
              style={{ fontSize: 12 }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={startEditRice}
              className="underline decoration-dotted underline-offset-1 hover:text-zinc-300"
            >
              约{riceGrams}g
            </button>
          )}
        </p>
      )}

      {effectiveMode === 'signature' && recipe && (
        <>
          <div className="mt-3 text-[13px] text-zinc-300">
            <p className="font-medium text-zinc-400">{recipe.name}</p>
            <ul className="mt-1 space-y-0.5">
              {recipe.items.map((item, i) => (
                <li key={i}>
                  {item.name} {item.amount}{item.unit}
                </li>
              ))}
            </ul>
          </div>
          {!isLogged && (
            <>
              <button
                type="button"
                onClick={handleSignatureCheckIn}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-medium transition"
                style={{ backgroundColor: '#FF3C3C', color: '#fff' }}
              >
                <Check className="h-5 w-5" />
                一键打卡
              </button>
              <button
                type="button"
                onClick={() => setMode('flexible')}
                className="mt-2 flex w-full items-center justify-center gap-1.5 text-[12px] text-zinc-500 transition hover:text-[#FF3C3C]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                切换到自定义
              </button>
            </>
          )}
        </>
      )}

      {effectiveMode === 'flexible' && (
        <>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowPicker(!showPicker)}
              className="flex items-center gap-1.5 text-[13px] text-zinc-400"
            >
              从食材库选择
              <ChevronDown className={`h-4 w-4 transition ${showPicker ? 'rotate-180' : ''}`} />
            </button>
            {showPicker && (
              <div className="mt-2 flex flex-wrap gap-2">
                {INGREDIENT_LIBRARY.map((ing) => (
                  <button
                    key={ing.id}
                    type="button"
                    onClick={() => toggleIngredient(ing.id)}
                    className="rounded-lg border px-2.5 py-1.5 text-[12px] transition"
                    style={{
                      borderColor: flexSelectedIds.includes(ing.id) ? '#FF3C3C' : '#404040',
                      backgroundColor: flexSelectedIds.includes(ing.id) ? 'rgba(255,60,60,0.1)' : 'transparent',
                      color: flexSelectedIds.includes(ing.id) ? '#fafafa' : '#a1a1aa',
                    }}
                  >
                    {ing.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {suggested.length > 0 && (
            <p className="mt-3 text-[13px] text-zinc-300">
              你还需要摄入约{' '}
              {suggested.map((s) => `${s.name} ${s.suggestedGrams}g`).join('，')}（熟重）
            </p>
          )}
          {!isLogged && (
            <>
              <button
                type="button"
                onClick={handleFlexibleCheckIn}
                disabled={suggested.length === 0}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-medium transition disabled:opacity-50"
                style={{ backgroundColor: '#FF3C3C', color: '#fff' }}
              >
                <Check className="h-5 w-5" />
                确认打卡
              </button>
              {recipe && (
                <button
                  type="button"
                  onClick={() => setMode('signature')}
                  className="mt-2 w-full text-center text-[12px] text-zinc-500 hover:text-zinc-300"
                >
                  返回招牌
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
