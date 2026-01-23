import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { normalizeName } from '../lib/normalize.js';

const router = Router();

const createSchema = z.object({
  name: z.string().trim().min(1, 'חובה להזין שם קטגוריה'),
  default_margin_percent: z.coerce
    .number()
    .min(0, 'אחוז רווח חייב להיות 0 או יותר')
    .max(500, 'אחוז רווח לא יכול להיות מעל 500')
    .default(0),
});

const updateSchema = createSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'לא נשלחו שדות לעדכון',
});

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .select('id,name,default_margin_percent,is_active,created_at')
    .eq('is_active', true)
    .order('name');

  if (error) return res.status(500).json({ error: 'שגיאה בטעינת קטגוריות' });
  return res.json(data);
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' });
  }

  const { name, default_margin_percent } = parsed.data;
  const nameNorm = normalizeName(name);

  try {
    // Rely on DB unique index (LOWER(name)), but also try to give הודעה יפה כשיש כפילות
    const exists = await supabase
      .from('categories')
      .select('id')
      .eq('is_active', true)
      .ilike('name', name.trim())
      .limit(1);

    if (exists.data?.length) {
      return res.status(409).json({ error: 'קטגוריה בשם הזה כבר קיימת' });
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({ name: name.trim(), default_margin_percent, is_active: true })
      .select('id,name,default_margin_percent,is_active,created_at')
      .single();

    if (error) {
      // אם זו שגיאת unique constraint מה־DB – נחזיר הודעה ברורה יותר
      if ((error as any).code === '23505') {
        return res.status(409).json({ error: 'קטגוריה בשם הזה כבר קיימת' });
      }
      console.error('Error creating category:', error);
      return res.status(500).json({ error: 'שגיאה ביצירת קטגוריה' });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Unexpected error creating category:', err);
    return res.status(500).json({ error: 'שגיאה ביצירת קטגוריה' });
  }
});

router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.name != null) patch.name = parsed.data.name.trim();
  if (parsed.data.default_margin_percent != null) patch.default_margin_percent = parsed.data.default_margin_percent;

  const { data, error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', id)
    .select('id,name,default_margin_percent,is_active,created_at')
    .single();

  if (error) {
    return res.status(400).json({ error: 'לא ניתן לעדכן קטגוריה (ייתכן שיש כפילות בשם)' });
  }
  return res.json(data);
});

// Soft delete for consistency (keeps history intact)
router.delete('/:id', async (req, res) => {
  const id = req.params.id;

  try {
    // Find or create the "כללי" category
    const generalName = 'כללי';

    let general = await supabase
      .from('categories')
      .select('id')
      .eq('name', generalName)
      .eq('is_active', true)
      .single();

    if (general.error && general.error.code !== 'PGRST116') {
      // PGRST116 = no rows found
      console.error('Error loading general category:', general.error);
      return res.status(400).json({ error: 'לא ניתן למחוק קטגוריה' });
    }

    if (!general.data) {
      const created = await supabase
        .from('categories')
        .insert({ name: generalName, default_margin_percent: 0, is_active: true })
        .select('id')
        .single();

      if (created.error || !created.data) {
        console.error('Error creating general category:', created.error);
        return res.status(400).json({ error: 'לא ניתן למחוק קטגוריה' });
      }
      general = created;
    }

    const generalId = general.data!.id as string;

    // Move products of this category to "כללי"
    const moveProducts = await supabase
      .from('products')
      .update({ category_id: generalId })
      .eq('category_id', id);

    if (moveProducts.error) {
      console.error('Error moving products to general category:', moveProducts.error);
      return res.status(400).json({ error: 'לא ניתן למחוק קטגוריה' });
    }

    // Soft delete the category
    const { error } = await supabase.from('categories').update({ is_active: false }).eq('id', id);
    if (error) {
      console.error('Error soft deleting category:', error);
      return res.status(400).json({ error: 'לא ניתן למחוק קטגוריה' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Unexpected error deleting category:', err);
    return res.status(500).json({ error: 'לא ניתן למחוק קטגוריה' });
  }
});

export default router;

