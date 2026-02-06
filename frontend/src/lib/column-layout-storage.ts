/**
 * Column Layout Persistence
 * 
 * Manages saving/loading column layout preferences to/from database.
 * Falls back to localStorage if database is unavailable.
 */

import { DEFAULT_COLUMN_ORDER, DEFAULT_VISIBLE_COLUMNS } from './price-columns';
import { ColumnLayout } from './column-resolver';
import { settingsApi } from './api';

const STORAGE_KEY_PREFIX = 'stockly_table_layout_';
const PREFERENCE_KEY_PREFIX = 'table_layout_';

export type LayoutKey = 'productsTable' | 'priceHistoryTable';

function getStorageKey(layoutKey: LayoutKey): string {
  return `${STORAGE_KEY_PREFIX}${layoutKey}`;
}

function getPreferenceKey(layoutKey: LayoutKey): string {
  return `${PREFERENCE_KEY_PREFIX}${layoutKey}`;
}

/**
 * Load layout from localStorage only (no API call).
 * 
 * CRITICAL: This function does NOT make API calls to prevent duplicate requests during boot.
 * Table layout should come through bootstrap and be accessed via useTableLayout() hook.
 * 
 * This function is kept for backward compatibility and fallback scenarios.
 * 
 * @param layoutKey - The layout key (e.g., 'productsTable', 'priceHistoryTable')
 */
export async function loadLayout(layoutKey: LayoutKey = 'productsTable'): Promise<Partial<ColumnLayout> | null> {
  const STORAGE_KEY = getStorageKey(layoutKey);
  
  // Only use localStorage - no API call to prevent duplicate requests during boot
  // Table layout comes through bootstrap and should be accessed via useTableLayout() hook
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (error) {
    console.error(`Failed to load column layout (${layoutKey}) from localStorage:`, error);
    return null;
  }
}

/**
 * Save layout to database (with localStorage backup)
 * @param layout - The layout to save
 * @param layoutKey - The layout key (e.g., 'productsTable', 'priceHistoryTable')
 */
export async function saveLayout(layout: Partial<ColumnLayout>, layoutKey: LayoutKey = 'productsTable'): Promise<void> {
  const PREFERENCE_KEY = getPreferenceKey(layoutKey);
  const STORAGE_KEY = getStorageKey(layoutKey);
  
  try {
    // Save to database
    await settingsApi.setPreference(PREFERENCE_KEY, layout);
    // Also save to localStorage as backup
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Ignore localStorage errors
    }
    // Dispatch event to notify other pages
    window.dispatchEvent(new CustomEvent('tableLayoutChanged', { detail: { layoutKey } }));
  } catch (error) {
    console.error(`Failed to save column layout (${layoutKey}) to database:`, error);
    // Fallback to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
      window.dispatchEvent(new CustomEvent('tableLayoutChanged', { detail: { layoutKey } }));
    } catch (err) {
      console.error(`Failed to save column layout (${layoutKey}) to localStorage:`, err);
    }
  }
}

/**
 * Reset layout to defaults
 * @param layoutKey - The layout key (e.g., 'productsTable', 'priceHistoryTable')
 */
export async function resetLayout(layoutKey: LayoutKey = 'productsTable'): Promise<void> {
  const PREFERENCE_KEY = getPreferenceKey(layoutKey);
  const STORAGE_KEY = getStorageKey(layoutKey);
  
  try {
    // Delete from database
    await settingsApi.deletePreference(PREFERENCE_KEY);
    // Also delete from localStorage
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore localStorage errors
    }
    // Dispatch event to notify other pages
    window.dispatchEvent(new CustomEvent('tableLayoutChanged', { detail: { layoutKey } }));
  } catch (error) {
    console.error(`Failed to reset column layout (${layoutKey}) in database:`, error);
    // Fallback to localStorage
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('tableLayoutChanged', { detail: { layoutKey } }));
    } catch (err) {
      console.error(`Failed to reset column layout (${layoutKey}) in localStorage:`, err);
    }
  }
}

/**
 * Merge user layout with defaults
 */
export function mergeWithDefaults(userLayout: Partial<ColumnLayout> | null): ColumnLayout {
  return {
    visible: { ...DEFAULT_VISIBLE_COLUMNS, ...userLayout?.visible },
    order: userLayout?.order || DEFAULT_COLUMN_ORDER,
    widths: userLayout?.widths,
  };
}
