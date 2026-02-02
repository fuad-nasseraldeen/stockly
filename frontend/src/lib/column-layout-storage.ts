/**
 * Column Layout Persistence
 * 
 * Manages saving/loading column layout preferences to/from database.
 * Falls back to localStorage if database is unavailable.
 */

import { DEFAULT_COLUMN_ORDER, DEFAULT_VISIBLE_COLUMNS } from './price-columns';
import { ColumnLayout } from './column-resolver';
import { settingsApi } from './api';

const STORAGE_KEY = 'stockly_price_table_layout';
const PREFERENCE_KEY = 'price_table_layout';

/**
 * Load layout from database (with localStorage fallback)
 */
export async function loadLayout(): Promise<Partial<ColumnLayout> | null> {
  try {
    // Try database first
    const dbLayout = await settingsApi.getPreference<Partial<ColumnLayout>>(PREFERENCE_KEY);
    if (dbLayout) {
      // Also sync to localStorage as backup
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dbLayout));
      } catch {
        // Ignore localStorage errors
      }
      return dbLayout;
    }
  } catch (error) {
    console.warn('Failed to load column layout from database, trying localStorage:', error);
  }

  // Fallback to localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load column layout from localStorage:', error);
    return null;
  }
}

/**
 * Save layout to database (with localStorage backup)
 */
export async function saveLayout(layout: Partial<ColumnLayout>): Promise<void> {
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
    window.dispatchEvent(new Event('priceTableLayoutChanged'));
  } catch (error) {
    console.error('Failed to save column layout to database:', error);
    // Fallback to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
      window.dispatchEvent(new Event('priceTableLayoutChanged'));
    } catch (err) {
      console.error('Failed to save column layout to localStorage:', err);
    }
  }
}

/**
 * Reset layout to defaults
 */
export async function resetLayout(): Promise<void> {
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
    window.dispatchEvent(new Event('priceTableLayoutChanged'));
  } catch (error) {
    console.error('Failed to reset column layout in database:', error);
    // Fallback to localStorage
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event('priceTableLayoutChanged'));
    } catch (err) {
      console.error('Failed to reset column layout in localStorage:', err);
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
