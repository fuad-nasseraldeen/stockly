import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { normalizeName } from '../lib/normalize.js';

const router = Router();

const createSchema = z.object({
  name: z.string().trim().min(1, 'חובה להזין שם ספק'),
  phone: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const updateSchema = createSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'לא נשלחו שדות לעדכון',
});

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id,name,phone,notes,is_active,created_at')
    .eq('is_active', true)
    .order('name');

  if (error) return res.status(500).json({ error: 'שגיאה בטעינת ספקים' });
  return res.json(data);
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' });
  }

  const { name, phone, notes } = parsed.data;

  try {
    const exists = await supabase
      .from('suppliers')
      .select('id')
      .eq('is_active', true)
      .ilike('name', name.trim())
      .limit(1);

    if (exists.data?.length) {
      return res.status(409).json({ error: 'ספק בשם הזה כבר קיים' });
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert({ name: name.trim(), phone: phone ?? null, notes: notes ?? null, is_active: true })
      .select('id,name,phone,notes,is_active,created_at')
      .single();

    if (error) {
      if ((error as any).code === '23505') {
        return res.status(409).json({ error: 'ספק בשם הזה כבר קיים' });
      }
      console.error('Error creating supplier:', error);
      return res.status(500).json({ error: 'שגיאה ביצירת ספק' });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Unexpected error creating supplier:', err);
    return res.status(500).json({ error: 'שגיאה ביצירת ספק' });
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
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone ?? null;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes ?? null;

  const { data, error } = await supabase
    .from('suppliers')
    .update(patch)
    .eq('id', id)
    .select('id,name,phone,notes,is_active,created_at')
    .single();

  if (error) {
    return res.status(400).json({ error: 'לא ניתן לעדכן ספק (ייתכן שיש כפילות בשם)' });
  }
  return res.json(data);
});

// Soft delete (keeps price history intact). Also returns a warning if supplier has price entries.
router.delete('/:id', async (req, res) => {
  const id = req.params.id;

  const countRes = await supabase
    .from('price_entries')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id);

  const { error } = await supabase.from('suppliers').update({ is_active: false }).eq('id', id);
  if (error) return res.status(400).json({ error: 'לא ניתן למחוק ספק' });

  const linkedCount = countRes.count ?? 0;
  return res.json({
    success: true,
    warning: linkedCount > 0 ? `הספק הושבת. קיימת היסטוריית מחירים (${linkedCount}) שנשמרה.` : undefined,
  });
});

export default router;

