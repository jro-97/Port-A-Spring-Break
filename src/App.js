import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MEALS, SHOPPING_LIST, FLEX_MEAL_SHOPPING_MAP } from './mealData';

// ============================================================
// TRIP MEALS — Port Aransas Spring Break 2026
// ============================================================
// GitHub API credentials for shared state sync.
// To generate a token: GitHub → Settings → Developer Settings
// → Personal Access Tokens → Generate new token → select repo scope
const GITHUB_OWNER = "jro-97";
const GITHUB_REPO = "Port-A-Spring-Break";
const GITHUB_TOKEN = "YOUR_PERSONAL_ACCESS_TOKEN_HERE";
// ============================================================

// ── Family members ──
const FAMILY = [
  { id: 'joe', name: 'Joe', role: 'Dad', color: '#2E86AB', canEdit: true },
  { id: 'mom', name: 'Mom', role: 'Mom', color: '#E07A5F', canEdit: true },
  { id: 'rosy', name: 'Rosy', role: '', color: '#52B788', canEdit: false },
  { id: 'ruby', name: 'Ruby', role: '', color: '#F4A261', canEdit: false },
];

const REACTION_EMOJIS = ['👍', '🤷', '😬'];
const DAYS = ['Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Trip dates: Wed Mar 18 – Sat Mar 21, 2026
const TRIP_START = new Date(2026, 2, 18); // March 18

function getDefaultState() {
  return {
    mealStatuses: {},
    mealNotes: {},
    reactions: {},
    suggestions: {},
    shoppingChecked: {},
    pizzaDeployed: null,
    activityLog: [],
  };
}

// ── GitHub sync ──
let _sha = null;

async function fetchState() {
  if (GITHUB_TOKEN === "YOUR_PERSONAL_ACCESS_TOKEN_HERE") {
    const stored = localStorage.getItem('tripMealsState');
    return stored ? JSON.parse(stored) : null;
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/state.json`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub GET ${res.status}`);
    const data = await res.json();
    _sha = data.sha;
    return JSON.parse(atob(data.content));
  } catch (e) {
    console.warn('GitHub fetch failed, using localStorage', e);
    const stored = localStorage.getItem('tripMealsState');
    return stored ? JSON.parse(stored) : null;
  }
}

async function saveState(state) {
  localStorage.setItem('tripMealsState', JSON.stringify(state));
  if (GITHUB_TOKEN === "YOUR_PERSONAL_ACCESS_TOKEN_HERE") return 'synced';
  try {
    const body = {
      message: 'Update trip meals state',
      content: btoa(unescape(encodeURIComponent(JSON.stringify(state, null, 2)))),
    };
    if (_sha) body.sha = _sha;
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/state.json`,
      {
        method: 'PUT',
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json' },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) throw new Error(`GitHub PUT ${res.status}`);
    const data = await res.json();
    _sha = data.content.sha;
    return 'synced';
  } catch (e) {
    console.warn('GitHub save failed', e);
    return 'failed';
  }
}

// ── Time helpers ──
function getCurrentMealContext() {
  const now = new Date();
  const tripDay = Math.floor((now - TRIP_START) / 86400000);
  const hour = now.getHours();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[now.getDay()];
  let period = 'morning';
  if (hour >= 12 && hour < 17) period = 'afternoon';
  else if (hour >= 17) period = 'evening';
  const friendlyTime = `${dayName} ${period}`;

  let current = null;
  let next = null;
  for (let i = 0; i < MEALS.length; i++) {
    const m = MEALS[i];
    const mealDayOffset = m.dayIndex;
    if (mealDayOffset < tripDay) continue;
    if (mealDayOffset > tripDay) {
      if (!current) current = m;
      if (!next && current && current.id !== m.id) next = m;
      break;
    }
    if (hour < m.timeWindow.end) {
      if (!current) current = m;
      else if (!next) { next = m; break; }
    }
  }
  if (!current) current = MEALS[MEALS.length - 1];
  if (!next) {
    const ci = MEALS.indexOf(current);
    if (ci < MEALS.length - 1) next = MEALS[ci + 1];
  }
  return { friendlyTime, current, next, tripDay };
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function SyncIcon({ status }) {
  if (status === 'saving') return <span className="animate-spin inline-block text-sm">⟳</span>;
  if (status === 'failed') return <span className="text-red-300 text-sm" title="Sync failed — saved locally">⚠️</span>;
  return <span className="text-green-300 text-sm" title="Synced">☁✓</span>;
}

// ── App ──
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('tripMealsUser'));
  const [appState, setAppState] = useState(getDefaultState());
  const [syncStatus, setSyncStatus] = useState('synced');
  const [activeTab, setActiveTab] = useState('now');
  const [loaded, setLoaded] = useState(false);
  const [lastFamilyView, setLastFamilyView] = useState(() => {
    const v = localStorage.getItem('tripMealsLastFamilyView');
    return v ? new Date(v) : new Date(0);
  });
  const stateRef = useRef(appState);
  stateRef.current = appState;

  useEffect(() => {
    fetchState().then(s => {
      if (s) setAppState(prev => ({ ...getDefaultState(), ...s }));
      setLoaded(true);
    });
  }, []);

  const persist = useCallback(async (newState) => {
    setAppState(newState);
    stateRef.current = newState;
    setSyncStatus('saving');
    const result = await saveState(newState);
    setSyncStatus(result);
  }, []);

  const user = FAMILY.find(f => f.id === currentUser);
  const canEdit = user?.canEdit ?? false;

  const unreadCount = appState.activityLog.filter(a => new Date(a.at) > lastFamilyView && a.by !== currentUser).length;

  const addActivity = useCallback((state, type, mealId, text) => {
    const entry = { id: Date.now().toString(), type, by: currentUser, mealId, text, at: new Date().toISOString() };
    return { ...state, activityLog: [entry, ...(state.activityLog || [])] };
  }, [currentUser]);

  // ── User selection screen ──
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-sand flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold text-ocean mb-2">Trip Meals</h1>
        <p className="text-lg text-gray-600 mb-8">Port Aransas Spring Break 2026</p>
        <p className="text-xl font-semibold mb-6">Who are you?</p>
        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
          {FAMILY.map(f => (
            <button
              key={f.id}
              onClick={() => { localStorage.setItem('tripMealsUser', f.id); setCurrentUser(f.id); }}
              className="rounded-2xl p-6 text-white font-bold text-lg shadow-lg active:scale-95 transition-transform"
              style={{ backgroundColor: f.color, minHeight: 88 }}
            >
              {f.name}
              {f.role && <span className="block text-sm font-normal opacity-80">({f.role})</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!loaded) {
    return <div className="min-h-screen bg-sand flex items-center justify-center text-ocean text-xl">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-sand flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-ocean text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: user.color }} />
          <span className="font-bold">{user.name}</span>
          <button onClick={() => { localStorage.removeItem('tripMealsUser'); setCurrentUser(null); }} className="text-xs opacity-70 underline ml-2">Not you?</button>
        </div>
        <div className="flex items-center gap-2">
          <SyncIcon status={syncStatus} />
          <span className="text-xs font-bold opacity-80">Trip Meals</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {activeTab === 'now' && <NowTab appState={appState} persist={persist} canEdit={canEdit} currentUser={currentUser} addActivity={addActivity} />}
        {activeTab === 'meals' && <MealsTab appState={appState} persist={persist} canEdit={canEdit} currentUser={currentUser} addActivity={addActivity} />}
        {activeTab === 'shop' && <ShopTab appState={appState} persist={persist} currentUser={currentUser} />}
        {activeTab === 'family' && <FamilyTab appState={appState} currentUser={currentUser} lastFamilyView={lastFamilyView} setLastFamilyView={setLastFamilyView} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 flex justify-around items-center h-16 shadow-lg">
        {[
          { key: 'now', label: 'Now', icon: '⏰' },
          { key: 'meals', label: 'Meals', icon: '🍽️' },
          { key: 'shop', label: 'Shop', icon: '🛒' },
          { key: 'family', label: 'Family', icon: '👨‍👩‍👧‍👧', badge: unreadCount },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => {
              setActiveTab(t.key);
              if (t.key === 'family') {
                const now = new Date();
                setLastFamilyView(now);
                localStorage.setItem('tripMealsLastFamilyView', now.toISOString());
              }
            }}
            className={`flex flex-col items-center justify-center flex-1 h-full relative ${activeTab === t.key ? 'text-ocean font-bold' : 'text-gray-400'}`}
          >
            <span className="text-xl">{t.icon}</span>
            <span className="text-xs mt-0.5">{t.label}</span>
            {t.badge > 0 && (
              <span className="absolute top-1 right-1/4 bg-coral text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{t.badge > 9 ? '9+' : t.badge}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// NOW TAB
// ══════════════════════════════════════════════════════════════
function NowTab({ appState, persist, canEdit, currentUser, addActivity }) {
  const { friendlyTime, current, next } = getCurrentMealContext();
  const [showDeploy, setShowDeploy] = useState(false);

  const flexMeals = MEALS.filter(m => m.flex);
  const flexActivity = flexMeals.filter(m => {
    const s = appState.mealStatuses[m.id];
    return s === 'activated' || s === 'swapped';
  });

  function deployPizza(mealId) {
    const meal = MEALS.find(m => m.id === mealId);
    let s = { ...appState, pizzaDeployed: mealId, mealStatuses: { ...appState.mealStatuses, [mealId]: 'swapped' }, mealNotes: { ...appState.mealNotes, [mealId]: { text: 'Pizza deployed.', by: currentUser, at: new Date().toISOString() } } };
    s = addActivity(s, 'pizza', mealId, `Deployed pizza wildcard on ${meal.name}`);
    persist(s);
    setShowDeploy(false);
  }

  return (
    <div className="p-4 space-y-4">
      <div className="text-center">
        <p className="text-2xl font-bold text-ocean capitalize">{friendlyTime}</p>
      </div>

      {current && (
        <div className="bg-cream rounded-2xl shadow-md p-5 border-l-4 border-ocean">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-bold mb-1">Up Now</p>
          <p className="text-xl font-bold text-gray-800">{current.name}</p>
          <p className="text-sm text-gray-500 mt-1">{current.day} — {current.type}</p>
          <p className="text-sm mt-1">{current.source}</p>
          <p className="text-base text-gray-700 mt-2">{current.description}</p>
          {current.flex && <span className="inline-block mt-2 bg-seafoam text-white text-xs font-bold px-2 py-0.5 rounded-full">FLEX</span>}
          {current.locked && <span className="inline-block mt-2 bg-deepGold text-white text-xs font-bold px-2 py-0.5 rounded-full">🍽️ Reservation — Locked</span>}
          {appState.mealStatuses[current.id] === 'swapped' && (
            <div className="mt-2 bg-orange-50 border border-warmYellow rounded-lg p-2 text-sm">
              <span className="font-bold text-warmYellow">Swapped</span>
              {appState.mealNotes[current.id] && <span className="ml-2 text-gray-700">{appState.mealNotes[current.id].text}</span>}
            </div>
          )}
          {appState.mealStatuses[current.id] === 'activated' && (
            <div className="mt-2 bg-teal-50 border border-seafoam rounded-lg p-2 text-sm">
              <span className="font-bold text-seafoam">Activated</span>
              {appState.mealNotes[current.id] && <span className="ml-2 text-gray-700">{appState.mealNotes[current.id].text}</span>}
            </div>
          )}
        </div>
      )}

      {next && (
        <div className="bg-cream rounded-2xl shadow p-4 border-l-4 border-gray-300">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-bold mb-1">Up Next</p>
          <p className="text-lg font-semibold text-gray-700">{next.name}</p>
          <p className="text-sm text-gray-500">{next.day} — {next.type}</p>
          <p className="text-sm mt-1">{next.source}</p>
          {next.flex && <span className="inline-block mt-1 bg-seafoam text-white text-xs font-bold px-2 py-0.5 rounded-full">FLEX</span>}
        </div>
      )}

      <div className="bg-orange-50 border-2 border-dashed border-warmYellow rounded-2xl p-4">
        <p className="text-lg font-bold">🍕 Pizza Wildcard — {appState.pizzaDeployed ? 'Deployed' : 'Ready to Deploy'}</p>
        <p className="text-sm text-gray-600 mt-1">Use when the crowd grows, everyone is too tired, or a flex slot needs to swap. Scales to any group size.</p>
        {appState.pizzaDeployed && (
          <p className="text-sm font-semibold text-warmYellow mt-1">Deployed on: {MEALS.find(m => m.id === appState.pizzaDeployed)?.name}</p>
        )}
        {canEdit && !appState.pizzaDeployed && (
          <button onClick={() => setShowDeploy(true)} className="mt-3 bg-warmYellow text-white font-bold px-4 py-2 rounded-xl text-sm active:scale-95 transition-transform">Deploy</button>
        )}
      </div>

      {showDeploy && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowDeploy(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-8" onClick={e => e.stopPropagation()}>
            <p className="text-lg font-bold mb-3">Deploy Pizza Wildcard</p>
            <p className="text-sm text-gray-500 mb-4">Choose a flex slot to swap with pizza:</p>
            {flexMeals.filter(m => appState.mealStatuses[m.id] !== 'swapped').map(m => (
              <button key={m.id} onClick={() => deployPizza(m.id)} className="block w-full text-left p-3 mb-2 rounded-xl bg-sand hover:bg-orange-50 active:scale-95 transition-transform">
                <span className="font-bold">{m.day} — {m.type}</span>
                <span className="block text-sm text-gray-500">{m.name}</span>
              </button>
            ))}
            <button onClick={() => setShowDeploy(false)} className="mt-2 w-full p-3 rounded-xl bg-gray-100 text-gray-500 font-semibold">Cancel</button>
          </div>
        </div>
      )}

      {flexActivity.length > 0 && (
        <div>
          <p className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Flex Activity</p>
          {flexActivity.map(m => (
            <div key={m.id} className="bg-cream rounded-xl p-3 mb-2 border-l-4 border-seafoam">
              <p className="font-bold text-sm">{m.day} — {m.type}: {m.name}</p>
              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full text-white ${appState.mealStatuses[m.id] === 'activated' ? 'bg-seafoam' : 'bg-warmYellow'}`}>
                {appState.mealStatuses[m.id] === 'activated' ? 'Activated' : 'Swapped'}
              </span>
              {appState.mealNotes[m.id] && (
                <p className="text-sm text-gray-700 mt-1">
                  {appState.mealNotes[m.id].text}
                  <span className="text-xs text-gray-400 ml-2">— {FAMILY.find(f => f.id === appState.mealNotes[m.id].by)?.name}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MEALS TAB
// ══════════════════════════════════════════════════════════════
function MealsTab({ appState, persist, canEdit, currentUser, addActivity }) {
  const [expandedFlex, setExpandedFlex] = useState(null);
  const [showDeploy, setShowDeploy] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [suggestMeal, setSuggestMeal] = useState(null);
  const [suggestText, setSuggestText] = useState('');

  const flexMeals = MEALS.filter(m => m.flex);

  function deployPizza(mealId) {
    const meal = MEALS.find(m => m.id === mealId);
    let s = { ...appState, pizzaDeployed: mealId, mealStatuses: { ...appState.mealStatuses, [mealId]: 'swapped' }, mealNotes: { ...appState.mealNotes, [mealId]: { text: 'Pizza deployed.', by: currentUser, at: new Date().toISOString() } } };
    s = addActivity(s, 'pizza', mealId, `Deployed pizza wildcard on ${meal.name}`);
    persist(s);
    setShowDeploy(false);
  }

  function setFlexStatus(mealId, status, noteText) {
    const meal = MEALS.find(m => m.id === mealId);
    let s = { ...appState, mealStatuses: { ...appState.mealStatuses, [mealId]: status } };
    if (noteText !== undefined) {
      s.mealNotes = { ...s.mealNotes, [mealId]: { text: noteText, by: currentUser, at: new Date().toISOString() } };
    }
    s = addActivity(s, 'flex', mealId, `Set ${meal.name} to ${status}${noteText ? ': ' + noteText : ''}`);
    persist(s);
  }

  function setReaction(mealId, emoji) {
    const meal = MEALS.find(m => m.id === mealId);
    const mealReactions = { ...(appState.reactions[mealId] || {}) };
    if (mealReactions[currentUser] === emoji) {
      delete mealReactions[currentUser];
    } else {
      mealReactions[currentUser] = emoji;
    }
    let s = { ...appState, reactions: { ...appState.reactions, [mealId]: mealReactions } };
    s = addActivity(s, 'reaction', mealId, `Reacted ${emoji} to ${meal.name}`);
    persist(s);
  }

  function submitSuggestion(mealId) {
    if (!suggestText.trim()) return;
    const meal = MEALS.find(m => m.id === mealId);
    const sug = { id: Date.now().toString(), text: suggestText.trim(), by: currentUser, at: new Date().toISOString(), status: 'pending', response: null, responseBy: null, responseAt: null };
    const mealSugs = [...(appState.suggestions[mealId] || []), sug];
    let s = { ...appState, suggestions: { ...appState.suggestions, [mealId]: mealSugs } };
    s = addActivity(s, 'suggestion', mealId, `Suggested swap for ${meal.name}: "${suggestText.trim()}"`);
    persist(s);
    setSuggestMeal(null);
    setSuggestText('');
  }

  function respondSuggestion(mealId, sugId, status) {
    const meal = MEALS.find(m => m.id === mealId);
    const mealSugs = (appState.suggestions[mealId] || []).map(s =>
      s.id === sugId ? { ...s, status, responseBy: currentUser, responseAt: new Date().toISOString() } : s
    );
    let s = { ...appState, suggestions: { ...appState.suggestions, [mealId]: mealSugs } };
    s = addActivity(s, 'response', mealId, `${status} suggestion for ${meal.name}`);
    persist(s);
  }

  const grouped = DAYS.map(day => ({ day, meals: MEALS.filter(m => m.day === day) }));

  return (
    <div className="p-4 space-y-3">
      {/* Pizza Wildcard */}
      <div className="bg-orange-50 border-2 border-dashed border-warmYellow rounded-2xl p-4">
        <p className="text-lg font-bold">🍕 Pizza Wildcard — {appState.pizzaDeployed ? 'Deployed' : 'Unassigned'}</p>
        <p className="text-sm text-gray-600 mt-1">Deploy when the crowd grows, everyone is too tired to cook, or a flex slot needs to swap. Just order more boxes. Scales from 8 to 16 people without changing anything.</p>
        {appState.pizzaDeployed && <p className="text-sm font-semibold text-warmYellow mt-1">Deployed on: {MEALS.find(m => m.id === appState.pizzaDeployed)?.name}</p>}
        {canEdit && !appState.pizzaDeployed && (
          <button onClick={() => setShowDeploy(true)} className="mt-3 bg-warmYellow text-white font-bold px-4 py-2 rounded-xl text-sm active:scale-95 transition-transform">Deploy</button>
        )}
      </div>

      {showDeploy && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowDeploy(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-8" onClick={e => e.stopPropagation()}>
            <p className="text-lg font-bold mb-3">Deploy Pizza Wildcard</p>
            <p className="text-sm text-gray-500 mb-4">Choose a flex slot to swap with pizza:</p>
            {flexMeals.filter(m => appState.mealStatuses[m.id] !== 'swapped').map(m => (
              <button key={m.id} onClick={() => deployPizza(m.id)} className="block w-full text-left p-3 mb-2 rounded-xl bg-sand hover:bg-orange-50 active:scale-95 transition-transform">
                <span className="font-bold">{m.day} — {m.type}</span>
                <span className="block text-sm text-gray-500">{m.name}</span>
              </button>
            ))}
            <button onClick={() => setShowDeploy(false)} className="mt-2 w-full p-3 rounded-xl bg-gray-100 text-gray-500 font-semibold">Cancel</button>
          </div>
        </div>
      )}

      {/* Nutrition Summary */}
      <div className="bg-nutritionBg rounded-2xl p-4">
        <button onClick={() => setShowNutrition(!showNutrition)} className="w-full text-left flex items-center justify-between">
          <span className="font-bold text-gray-800">📋 Nutrition Reminders — The Full Picture</span>
          <span className="text-gray-400">{showNutrition ? '▲' : '▼'}</span>
        </button>
        {showNutrition && (
          <div className="mt-3 text-sm text-gray-700 space-y-3">
            <div><strong>EVERY BREAKFAST:</strong> Run a yogurt parfait bar alongside the cooked meal — Costco granola, yogurt cups, and cut fruit. Self-serve. Teenage girls will eat it if it is sitting there.</div>
            <div><strong>EVERY DINNER — one intentional vegetable side every time:</strong>
              <ul className="list-disc ml-5 mt-1">
                <li>Burgers → coleslaw mix or sliced avocado and tomato</li>
                <li>Pasta → green salad with mixed greens, cherry tomatoes, cucumber</li>
                <li>Tacos → loaded topping bar: black beans, avocado, shredded cabbage, tomatoes</li>
              </ul>
            </div>
            <div><strong>BEACH SNACK BAG — assemble every morning before beach:</strong> Yogurt cups, granola, grapes or berries, string cheese, hummus and baby carrots, granola bars, nuts. Chips go in alongside, not as the anchor.</div>
            <div><strong>FRUIT TOAST BAR — appears at two breakfast windows only:</strong> Friday breakfast and Saturday breakfast. Almond butter on toast or bread topped with sliced banana, berries, kiwi, and available fruit. Cold prep. No cooking. Prioritize bananas and kiwi at Thursday and Friday breakfast — they are the most perishable items in the cooler.</div>
            <div><strong>BEANS — double duty.</strong> One purchase covers breakfast tacos Thursday and taco dinner Friday.</div>
            <div><strong>TORTILLAS — double duty.</strong> One large pack covers breakfast tacos Thursday and taco dinner Friday.</div>
          </div>
        )}
      </div>

      {/* Meal cards by day */}
      {grouped.map(g => (
        <div key={g.day}>
          <div className="sticky top-[52px] z-20 bg-sand py-2">
            <h2 className="text-xl font-bold text-ocean">{g.day}</h2>
          </div>
          {g.meals.map(meal => {
            const status = appState.mealStatuses[meal.id] || 'planned';
            const note = appState.mealNotes[meal.id];
            const reactions = appState.reactions[meal.id] || {};
            const suggestions = appState.suggestions[meal.id] || [];
            const hasPendingSuggestions = suggestions.some(s => s.status === 'pending');

            return (
              <div key={meal.id} className="bg-cream rounded-2xl shadow p-4 mb-3 relative">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                  <p className="text-xs uppercase tracking-wide text-gray-400 font-bold">{meal.day} — {meal.type}</p>
                  <div className="flex gap-1 flex-wrap">
                    {meal.flex && <span className="bg-seafoam text-white text-xs font-bold px-2 py-0.5 rounded-full">FLEX</span>}
                    {meal.locked && <span className="bg-deepGold text-white text-xs font-bold px-2 py-0.5 rounded-full">🍽️ Reservation — Locked</span>}
                    {status === 'activated' && <span className="bg-seafoam text-white text-xs font-bold px-2 py-0.5 rounded-full">Activated</span>}
                    {status === 'swapped' && <span className="bg-warmYellow text-white text-xs font-bold px-2 py-0.5 rounded-full">Swapped</span>}
                    {hasPendingSuggestions && canEdit && <span className="bg-coral text-white text-xs font-bold px-2 py-0.5 rounded-full">!</span>}
                  </div>
                </div>

                <p className="text-sm text-gray-500 mb-1">{meal.source}</p>
                <p className="text-xl font-bold text-gray-800 mb-2">{meal.name}</p>
                <p className="text-base text-gray-700 mb-2">{meal.description}</p>

                {meal.nutritionNote && (
                  <div className="bg-nutritionBg rounded-lg p-2 mb-2 text-sm text-green-800">
                    🥗 {meal.nutritionNote}
                  </div>
                )}

                {meal.scaleNote && (
                  <div className="bg-scaleBg rounded-lg p-2 mb-2 text-sm text-blue-800">
                    📈 {meal.scaleNote}
                  </div>
                )}

                {(status === 'activated' || status === 'swapped') && note && (
                  <div className={`rounded-lg p-2 mb-2 text-sm border ${status === 'activated' ? 'bg-teal-50 border-seafoam' : 'bg-orange-50 border-warmYellow'}`}>
                    <span className="font-bold">{status === 'activated' ? 'Activated' : 'Swapped'}:</span> {note.text}
                    <span className="text-xs text-gray-400 ml-2">— {FAMILY.find(f => f.id === note.by)?.name}, {timeAgo(note.at)}</span>
                  </div>
                )}

                {meal.flex && !meal.locked && (
                  <div className="mb-2">
                    <button onClick={() => setExpandedFlex(expandedFlex === meal.id ? null : meal.id)} className="text-sm text-seafoam font-bold underline">
                      {expandedFlex === meal.id ? 'Hide Flex Details' : 'Show Flex Details'}
                    </button>
                    {expandedFlex === meal.id && (
                      <div className="mt-2 bg-teal-50 rounded-xl p-3 text-sm space-y-2">
                        <p className="text-gray-700">{meal.flexDescription}</p>
                        {canEdit && (
                          <>
                            <div className="flex gap-2">
                              {['planned', 'activated', 'swapped'].map(st => (
                                <button key={st} onClick={() => setFlexStatus(meal.id, st, note?.text)} className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize ${status === st ? (st === 'planned' ? 'bg-gray-400 text-white' : st === 'activated' ? 'bg-seafoam text-white' : 'bg-warmYellow text-white') : 'bg-gray-100 text-gray-500'}`}>{st}</button>
                              ))}
                            </div>
                            <FlexNoteInput mealId={meal.id} currentNote={note?.text || ''} onSave={(text) => setFlexStatus(meal.id, status, text)} />
                          </>
                        )}
                        {note && <p className="text-xs text-gray-400">Last changed by {FAMILY.find(f => f.id === note.by)?.name} — {timeAgo(note.at)}</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Reactions */}
                <div className="flex items-center gap-4 mt-2 mb-2">
                  {REACTION_EMOJIS.map(emoji => {
                    const reactors = FAMILY.filter(f => reactions[f.id] === emoji);
                    return (
                      <button key={emoji} onClick={() => setReaction(meal.id, emoji)} className="flex flex-col items-center min-w-[44px] min-h-[44px] justify-center">
                        <span className="text-xl">{emoji}</span>
                        <div className="flex gap-0.5 mt-0.5">
                          {reactors.map(f => <span key={f.id} className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: f.color }} />)}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Suggest a swap */}
                {meal.flex && !meal.locked && (
                  <div>
                    {suggestMeal === meal.id ? (
                      <div className="flex gap-2">
                        <input value={suggestText} onChange={e => setSuggestText(e.target.value)} placeholder="Suggest a swap..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                        <button onClick={() => submitSuggestion(meal.id)} className="bg-ocean text-white px-3 py-2 rounded-lg text-sm font-bold">Send</button>
                        <button onClick={() => { setSuggestMeal(null); setSuggestText(''); }} className="text-gray-400 text-sm">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setSuggestMeal(meal.id)} className="text-sm text-ocean font-semibold">💡 Suggest a Swap</button>
                    )}
                  </div>
                )}

                {/* Suggestions list */}
                {suggestions.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {suggestions.map(sug => (
                      <div key={sug.id} className="bg-gray-50 rounded-lg p-2 text-sm">
                        <p><span className="font-bold" style={{ color: FAMILY.find(f => f.id === sug.by)?.color }}>{FAMILY.find(f => f.id === sug.by)?.name}</span>: "{sug.text}" <span className="text-xs text-gray-400">{timeAgo(sug.at)}</span></p>
                        {sug.status !== 'pending' && (
                          <p className="text-xs mt-1">
                            <span className={`font-bold ${sug.status === 'accepted' ? 'text-seafoam' : sug.status === 'declined' ? 'text-coral' : 'text-warmYellow'}`}>{sug.status}</span>
                            {sug.response && <span className="ml-1 text-gray-500">— {sug.response}</span>}
                            <span className="text-gray-400 ml-1">by {FAMILY.find(f => f.id === sug.responseBy)?.name}</span>
                          </p>
                        )}
                        {sug.status === 'pending' && canEdit && (
                          <div className="flex gap-2 mt-1">
                            <button onClick={() => respondSuggestion(meal.id, sug.id, 'accepted')} className="bg-seafoam text-white text-xs font-bold px-2 py-1 rounded">Accept</button>
                            <button onClick={() => respondSuggestion(meal.id, sug.id, 'declined')} className="bg-coral text-white text-xs font-bold px-2 py-1 rounded">Decline</button>
                            <button onClick={() => respondSuggestion(meal.id, sug.id, 'considering')} className="bg-warmYellow text-white text-xs font-bold px-2 py-1 rounded">Considering</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function FlexNoteInput({ mealId, currentNote, onSave }) {
  const [text, setText] = useState(currentNote);
  return (
    <div className="flex gap-2">
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Coordination note..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
      <button onClick={() => onSave(text)} className="bg-ocean text-white px-3 py-1.5 rounded-lg text-sm font-bold">Save</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SHOP TAB
// ══════════════════════════════════════════════════════════════
function ShopTab({ appState, persist }) {
  const checked = appState.shoppingChecked || {};

  function toggleItem(itemId) {
    const newChecked = { ...checked, [itemId]: !checked[itemId] };
    persist({ ...appState, shoppingChecked: newChecked });
  }

  function resetSection(store) {
    const section = SHOPPING_LIST.find(s => s.store === store);
    if (!section) return;
    const newChecked = { ...checked };
    section.items.forEach(item => { delete newChecked[item.id]; });
    persist({ ...appState, shoppingChecked: newChecked });
  }

  function resetAll() {
    persist({ ...appState, shoppingChecked: {} });
  }

  const swappedFlags = {};
  Object.entries(FLEX_MEAL_SHOPPING_MAP).forEach(([mealId, itemNames]) => {
    if (appState.mealStatuses[mealId] === 'swapped') {
      const meal = MEALS.find(m => m.id === mealId);
      itemNames.forEach(name => { swappedFlags[name] = meal?.name || mealId; });
    }
  });

  const [collapsed, setCollapsed] = useState({});
  function toggleSection(store) {
    setCollapsed(c => ({ ...c, [store]: !c[store] }));
  }

  return (
    <div className="p-4 space-y-3">
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
        <p className="font-bold text-gray-800 mb-2">Key Reminders</p>
        <div className="text-sm text-gray-700 space-y-1.5">
          <p>⏰ Bananas and kiwi — buy Tuesday. Use at Thursday and Friday breakfast — perishable. Do not let them sit in the cooler past Friday.</p>
          <p>☕ Coffee — confirm what the rental unit has BEFORE packing the Nespresso. If they have nothing, bring: machine, pods (enough for 4 mornings plus guests), dairy creamer, non-dairy creamer.</p>
          <p>⚠️ Food allergies in the group — stock BOTH whole milk AND non-dairy milk (oat or almond). Same for coffee creamer. Confirm which family members and which guests need non-dairy.</p>
          <p>🫘 Beans pull double duty — breakfast tacos Thursday morning AND taco dinner Friday. One purchase, two meals.</p>
          <p>🫓 HEB tortillas pull double duty — breakfast tacos Thursday AND taco dinner Friday. Buy the large pack.</p>
          <p>🍕 Pizza — do NOT pre-buy. Order fresh when deployed.</p>
          <p>🥩 Buy extra burger patties if a Wednesday cookout flex seems likely based on what other families are doing.</p>
        </div>
      </div>

      <button onClick={() => persist({ ...appState })} className="w-full bg-ocean text-white font-bold py-2 rounded-xl text-sm">Refresh flags from meal plan</button>
      <button onClick={resetAll} className="w-full bg-gray-200 text-gray-600 font-bold py-2 rounded-xl text-sm">Reset All</button>

      {SHOPPING_LIST.map(section => {
        const checkedCount = section.items.filter(i => checked[i.id]).length;
        const isCollapsed = collapsed[section.store];

        return (
          <div key={section.store} className="bg-cream rounded-2xl p-4">
            <button onClick={() => toggleSection(section.store)} className="w-full flex items-center justify-between">
              <span className="font-bold text-gray-800">{section.store}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{checkedCount} of {section.items.length}</span>
                <span className="text-gray-400">{isCollapsed ? '▼' : '▲'}</span>
              </div>
            </button>
            {section.storeNote && !isCollapsed && (
              <p className="text-xs text-orange-600 font-semibold mt-1">{section.storeNote}</p>
            )}
            {!isCollapsed && (
              <div className="mt-2 space-y-1">
                {section.items.map(item => {
                  const isChecked = !!checked[item.id];
                  const flag = Object.entries(swappedFlags).find(([name]) => item.name.includes(name));

                  return (
                    <div key={item.id} className={`flex items-start gap-3 py-2 ${isChecked ? 'opacity-40' : ''}`}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleItem(item.id)} className="mt-1 w-5 h-5 rounded accent-ocean flex-shrink-0" />
                      <div className="flex-1">
                        <p className={`text-sm ${isChecked ? 'line-through' : ''}`}>{item.name}</p>
                        {item.note && <p className="text-xs text-gray-500">{item.note}</p>}
                        {flag && (
                          <p className="text-xs text-orange-600 font-semibold mt-0.5">⚠️ May not be needed — {flag[1]} was swapped.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => resetSection(section.store)} className="text-xs text-gray-400 underline mt-1">Reset section</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// FAMILY TAB
// ══════════════════════════════════════════════════════════════
function FamilyTab({ appState, currentUser, lastFamilyView, setLastFamilyView }) {
  useEffect(() => {
    const now = new Date();
    setLastFamilyView(now);
    localStorage.setItem('tripMealsLastFamilyView', now.toISOString());
  }, [setLastFamilyView]);

  const log = appState.activityLog || [];

  if (log.length === 0) {
    return (
      <div className="p-4">
        <div className="bg-cream rounded-2xl p-6 text-center text-gray-400">
          <p className="text-lg">No activity yet</p>
          <p className="text-sm mt-1">Reactions, suggestions, and flex changes will show up here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <h2 className="text-lg font-bold text-ocean mb-2">Family Activity</h2>
      {log.map(entry => {
        const member = FAMILY.find(f => f.id === entry.by);
        const meal = MEALS.find(m => m.id === entry.mealId);
        const isNew = new Date(entry.at) > lastFamilyView && entry.by !== currentUser;

        return (
          <div key={entry.id} className={`bg-cream rounded-xl p-3 ${isNew ? 'border-l-4 border-coral' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: member?.color }} />
              <span className="font-bold text-sm" style={{ color: member?.color }}>{member?.name}</span>
              <span className="text-xs text-gray-400 ml-auto">{timeAgo(entry.at)}</span>
            </div>
            <p className="text-sm text-gray-700">{entry.text}</p>
            {meal && <p className="text-xs text-gray-400 mt-0.5">{meal.day} — {meal.type}</p>}
          </div>
        );
      })}
    </div>
  );
}
