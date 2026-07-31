import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';

import { buildMarked, computeMonthStats, type LogRow, type MarkedDates, type Tag } from '@/lib/calendar';
import { supabase } from '@/services/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

type DayLog  = { tagIds: string[]; note: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TAGS: Tag[] = [
  { id: 'no_alcohol', label: 'Kein Alkohol', emoji: '🍷', color: '#00E5FF' },
  { id: 'period',     label: 'Periode',      emoji: '🩸', color: '#FF5252', pattern: 'striped' },
  { id: 'stress',     label: 'Viel Stress',  emoji: '🤯', color: '#FF9100' },
];

const COLOR_PALETTE = [
  '#00E5FF', '#FF5252', '#FF9100', '#4CAF50',
  '#AB47BC', '#FFD600', '#F06292', '#42A5F5',
];

const EMPTY_LOG: DayLog = { tagIds: [], note: '' };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const today        = new Date().toISOString().slice(0, 10);
  const todayMonth   = today.slice(0, 7); // YYYY-MM

  const [selectedDate, setSelectedDate] = useState(today);
  const [currentMonth, setCurrentMonth] = useState(todayMonth);
  const [log, setLog]                   = useState<DayLog>(EMPTY_LOG);
  const [tags, setTags]                 = useState<Tag[]>(DEFAULT_TAGS);
  const [allLogs, setAllLogs]           = useState<LogRow[]>([]);
  const [markedDates, setMarkedDates]   = useState<MarkedDates>({});
  const [saving, setSaving]               = useState(false);
  const [noteFocused, setNoteFocused]     = useState(false);
  const [cycleTracking, setCycleTracking] = useState(true); // default true until profile loads

  // Tag modal (add + edit)
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTag, setEditingTag]     = useState<Tag | null>(null);
  const [newLabel, setNewLabel]         = useState('');
  const [newEmoji, setNewEmoji]         = useState('');
  const [newColor, setNewColor]         = useState(COLOR_PALETTE[0]);
  const [addingTag, setAddingTag]       = useState(false);

  // Debounce ref
  const autoSaveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // ── Monthly stats (derived, live) ─────────────────────────────────────────

  const monthStats = useMemo(
    () => computeMonthStats(allLogs, currentMonth, tags),
    [allLogs, currentMonth, tags]
  );

  // ── Per-day tag list for calendar bars (derived, live) ────────────────────

  const tagsByDate = useMemo(() => {
    const tagMap = new Map(tags.map((t) => [t.id, t]));
    const visibleIds = new Set(
      tags.filter((t) => cycleTracking || t.id !== 'period').map((t) => t.id)
    );
    const result = new Map<string, Tag[]>();
    for (const row of allLogs) {
      const dayTags = row.tag_ids
        .filter((id) => visibleIds.has(id))
        .map((id) => tagMap.get(id))
        .filter((t): t is Tag => t !== undefined);
      if (dayTags.length > 0) result.set(row.date, dayTags);
    }
    return result;
  }, [allLogs, tags, cycleTracking]);

  // ── Custom day renderer (memoised to avoid recreation on every render) ────

  const DayCellRenderer = useCallback(
    (props: any) => (
      <DayCell {...props} tagsByDate={tagsByDate} selectedDate={selectedDate} />
    ),
    [tagsByDate, selectedDate],
  );

  // ── data loading ───────────────────────────────────────────────────────────

  const loadData = useCallback(
    async (date: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, allRes, dayRes] = await Promise.all([
        supabase.from('profiles').select('custom_tags, cycle_tracking_enabled').eq('id', user.id).maybeSingle(),
        supabase.from('daily_logs').select('date, tags, note').eq('user_id', user.id),
        supabase
          .from('daily_logs')
          .select('tags, note')
          .eq('user_id', user.id)
          .eq('date', date)
          .maybeSingle(),
      ]);

      const cycleEnabled: boolean = profileRes.data?.cycle_tracking_enabled ?? true;
      setCycleTracking(cycleEnabled);

      let resolvedTags: Tag[] = DEFAULT_TAGS;
      const raw = profileRes.data?.custom_tags;
      if (Array.isArray(raw) && raw.length > 0 && (raw[0] as Tag)?.id) {
        resolvedTags = raw as Tag[];
      }
      setTags(resolvedTags);

      // When cycle tracking is off, exclude the period tag from calendar dots
      const tagMap = new Map(
        resolvedTags
          .filter((t) => cycleEnabled || t.id !== 'period')
          .map((t) => [t.id, t])
      );
      const rows: LogRow[] = (allRes.data ?? []).map((r) => ({
        date:    r.date,
        tag_ids: (r.tags as string[]) ?? [],
        note:    r.note as string | null,
      }));

      setAllLogs(rows);
      setMarkedDates(buildMarked(rows, tagMap, date));
      setLog(
        dayRes.data
          ? { tagIds: (dayRes.data.tags as string[]) ?? [], note: dayRes.data.note ?? '' }
          : EMPTY_LOG
      );
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      loadData(selectedDate);
    }, [loadData, selectedDate])
  );

  // ── upsert ─────────────────────────────────────────────────────────────────

  const upsertLog = useCallback(
    async (dateToSave: string, logSnapshot: DayLog) => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { console.log('[calendar] auth error', authError); return; }

      const { error } = await supabase.from('daily_logs').upsert(
        { user_id: user.id, date: dateToSave, tags: logSnapshot.tagIds, note: logSnapshot.note.trim() || null },
        { onConflict: 'user_id,date' }
      );

      if (error) {
        console.log('[calendar] upsert error:', error);
      } else {
        console.log('[calendar] upsert ok', dateToSave, logSnapshot.tagIds);
        await loadData(dateToSave);
      }
    },
    [loadData]
  );

  // ── interactions ───────────────────────────────────────────────────────────

  const onDayPress = async (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
    await loadData(day.dateString);
  };

  const onMonthChange = (month: { dateString: string }) => {
    setCurrentMonth(month.dateString.slice(0, 7));
  };

  /** Toggle + optimistic allLogs update + debounced save */
  const toggleTag = (id: string) => {
    setLog((prev) => {
      const newIds = prev.tagIds.includes(id)
        ? prev.tagIds.filter((t) => t !== id)
        : [...prev.tagIds, id];
      const newLog = { ...prev, tagIds: newIds };

      // Optimistically update allLogs for instant stats refresh
      setAllLogs((rows) => {
        const existing = rows.find((r) => r.date === selectedDateRef.current);
        if (existing) {
          return rows.map((r) =>
            r.date === selectedDateRef.current ? { ...r, tag_ids: newIds } : r
          );
        }
        return [...rows, { date: selectedDateRef.current, tag_ids: newIds, note: null }];
      });

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        upsertLog(selectedDateRef.current, newLog);
      }, 600);

      return newLog;
    });
  };

  const onTagLongPress = (tag: Tag) => {
    openEditModal(tag);
  };

  const deleteTag = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const updated = tags.filter((t) => t.id !== id);
    const { error } = await supabase.from('profiles').update({ custom_tags: updated }).eq('id', user.id);
    if (error) { Alert.alert('Fehler', error.message); return; }
    setTags(updated);
    setLog((prev) => ({ ...prev, tagIds: prev.tagIds.filter((t) => t !== id) }));
  };

  const openAddModal = () => {
    setEditingTag(null);
    setNewLabel(''); setNewEmoji(''); setNewColor(COLOR_PALETTE[0]);
    setModalVisible(true);
  };

  const openEditModal = (tag: Tag) => {
    setEditingTag(tag);
    setNewLabel(tag.label);
    setNewEmoji(tag.emoji);
    setNewColor(tag.color);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingTag(null);
  };

  const saveTag = async () => {
    const labelTrimmed = newLabel.trim();
    if (!labelTrimmed) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setAddingTag(true);

    let updated: Tag[];
    if (editingTag) {
      updated = tags.map((t) =>
        t.id === editingTag.id
          ? { ...t, label: labelTrimmed, emoji: newEmoji.trim() || '🏷️', color: newColor }
          : t
      );
    } else {
      const newTag: Tag = { id: Date.now().toString(), label: labelTrimmed, emoji: newEmoji.trim() || '🏷️', color: newColor };
      updated = [...tags, newTag];
    }

    const { error } = await supabase.from('profiles').update({ custom_tags: updated }).eq('id', user.id);
    if (error) { Alert.alert('Fehler', error.message); } else { setTags(updated); }
    setAddingTag(false);
    closeModal();
  };

  const deleteDay = () => {
    if (log.tagIds.length === 0 && !log.note.trim()) return;
    Alert.alert(
      'Eintrag löschen?',
      'Alle Tags und Notizen für diesen Tag werden gelöscht.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen', style: 'destructive',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase.from('daily_logs')
              .delete()
              .eq('user_id', user.id)
              .eq('date', selectedDate);
            setLog(EMPTY_LOG);
            setAllLogs((prev) => prev.filter((r) => r.date !== selectedDate));
          },
        },
      ]
    );
  };

  const save = async () => {
    setSaving(true);
    await upsertLog(selectedDate.slice(0, 10), log);
    setSaving(false);
  };

  const formatDisplayDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
  };

  const formatMonth = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.screenTitle}>Kalender</Text>
          </View>

          {/* Calendar */}
          <View style={styles.card}>
            <Calendar
              current={selectedDate}
              onDayPress={onDayPress}
              onMonthChange={onMonthChange}
              dayComponent={DayCellRenderer}
              markedDates={markedDates}
              theme={{
                backgroundColor: '#1e1e1e',
                calendarBackground: '#1e1e1e',
                textSectionTitleColor: '#888',
                arrowColor: '#00E5FF',
                monthTextColor: '#fff',
                indicatorColor: '#00E5FF',
                textMonthFontWeight: '800',
                textDayHeaderFontWeight: '600',
              }}
              style={styles.calendar}
            />
          </View>

          {/* Input Area */}
          <View style={styles.card}>
            <View style={styles.dateTitleRow}>
              <Text style={styles.selectedDateText}>{formatDisplayDate(selectedDate)}</Text>
              {(log.tagIds.length > 0 || log.note.trim().length > 0) && (
                <TouchableOpacity onPress={deleteDay} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Ionicons name="trash-outline" size={18} color="#FF5252" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.labelRow}>
              <Text style={styles.label}>TAGS</Text>
              <TouchableOpacity style={styles.addTagButton} onPress={openAddModal} activeOpacity={0.8}>
                <Ionicons name="add" size={14} color="#00E5FF" />
                <Text style={styles.addTagText}>Neu</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chipRow}>
              {tags
                .filter((t) => cycleTracking || t.id !== 'period')
                .map((tag) => (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    active={log.tagIds.includes(tag.id)}
                    onPress={() => toggleTag(tag.id)}
                    onEdit={() => openEditModal(tag)}
                  />
                ))}
            </View>

            <Text style={styles.label}>NOTIZEN</Text>
            <TextInput
              style={[styles.noteInput, noteFocused && styles.noteInputFocused]}
              placeholder="Wie war dein Tag?"
              placeholderTextColor="#555"
              multiline
              numberOfLines={4}
              value={log.note}
              onChangeText={(text) => setLog((prev) => ({ ...prev, note: text }))}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              textAlignVertical="top"
            />

            <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#121212" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#121212" />
                  <Text style={styles.saveButtonText}>Speichern</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Monthly stats */}
          <View style={styles.card}>
            <Text style={styles.statsTitle}>
              Monats-Statistik{' '}
              <Text style={styles.statsMonth}>{formatMonth(currentMonth)}</Text>
            </Text>

            {monthStats.length === 0 ? (
              <Text style={styles.statsEmpty}>Noch keine Tags in diesem Monat.</Text>
            ) : (
              <View style={styles.statsGrid}>
                {monthStats.map(({ tag, count, total }) => (
                  <StatTile key={tag.id} tag={tag} count={count} total={total} />
                ))}
              </View>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* New-tag modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1} onPress={() => {}}>

            <Text style={styles.modalTitle}>{editingTag ? 'Tag bearbeiten' : 'Neuen Tag erstellen'}</Text>

            <View style={styles.modalRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="Name (z.B. Guter Schlaf)"
                placeholderTextColor="#555"
                value={newLabel}
                onChangeText={setNewLabel}
                autoFocus
                returnKeyType="next"
              />
              <TextInput
                style={[styles.modalInput, styles.emojiInput]}
                placeholder="😀"
                placeholderTextColor="#555"
                value={newEmoji}
                onChangeText={(t) => setNewEmoji(t.slice(-2))}
                maxLength={2}
              />
            </View>

            <Text style={styles.modalLabel}>FARBE</Text>
            <View style={styles.paletteRow}>
              {COLOR_PALETTE.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[styles.paletteColor, { backgroundColor: color }, newColor === color && styles.paletteColorSelected]}
                  onPress={() => setNewColor(color)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            <View style={styles.previewRow}>
              <Text style={styles.modalLabel}>VORSCHAU</Text>
              <View style={[styles.chip, { backgroundColor: newColor + '22', borderColor: newColor }]}>
                <Text style={[styles.chipText, { color: newColor }]}>
                  {newEmoji || '🏷️'} {newLabel || 'Mein Tag'}
                </Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeModal}>
                <Text style={styles.modalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, { backgroundColor: newColor }, (!newLabel.trim() || addingTag) && { opacity: 0.5 }]}
                onPress={saveTag}
                disabled={!newLabel.trim() || addingTag}>
                {addingTag
                  ? <ActivityIndicator color="#121212" size="small" />
                  : <Text style={styles.modalSaveText}>{editingTag ? 'Speichern' : 'Hinzufügen'}</Text>}
              </TouchableOpacity>
            </View>

            {editingTag && (
              <TouchableOpacity
                style={styles.modalDelete}
                onPress={() => Alert.alert(
                  `"${editingTag.emoji} ${editingTag.label}" löschen?`,
                  'Der Tag wird aus deiner Liste entfernt.',
                  [
                    { text: 'Abbrechen', style: 'cancel' },
                    { text: 'Löschen', style: 'destructive', onPress: () => { closeModal(); deleteTag(editingTag.id); } },
                  ]
                )}>
                <Ionicons name="trash-outline" size={15} color="#FF5252" />
                <Text style={styles.modalDeleteText}>Tag löschen</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── Calendar Day Cell ────────────────────────────────────────────────────────

const BAR_H   = 3;
const MAX_BARS = 4;
// Stripe x-offsets; overflow:hidden clips any excess
const STRIPE_XS = [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45];

type DateData = { dateString: string; day: number; month: number; year: number; timestamp: number };

function TagBar({ tag }: { tag: Tag }) {
  const striped = tag.pattern === 'striped';
  return (
    <View
      style={[
        dayStyles.bar,
        { backgroundColor: striped ? tag.color + '55' : tag.color, overflow: 'hidden' },
      ]}
    >
      {striped && STRIPE_XS.map((x) => (
        <View
          key={x}
          style={{
            position: 'absolute',
            left: x,
            top: -5,
            width: 2,
            height: 14,
            backgroundColor: tag.color,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
    </View>
  );
}

function DayCell({
  date,
  state,
  onPress,
  tagsByDate,
  selectedDate,
}: {
  date?: DateData;
  state?: 'disabled' | 'today' | '';
  marking?: any;
  onPress?: (date: DateData) => void;
  tagsByDate: Map<string, Tag[]>;
  selectedDate: string;
}) {
  if (!date) return <View style={{ flex: 1 }} />;

  const isSelected  = date.dateString === selectedDate;
  const isToday     = state === 'today';
  const isDisabled  = state === 'disabled';
  const dayTags     = tagsByDate.get(date.dateString) ?? [];
  const displayTags = dayTags.slice(0, MAX_BARS);
  const hasOverflow = dayTags.length > MAX_BARS;

  return (
    <TouchableOpacity
      style={dayStyles.container}
      onPress={() => !isDisabled && onPress?.(date)}
      activeOpacity={0.7}
      disabled={isDisabled}
    >
      {/* Date number with selection / today indicator */}
      <View style={[
        dayStyles.circle,
        isSelected            && dayStyles.circleSelected,
        isToday && !isSelected && dayStyles.circleToday,
      ]}>
        <Text style={[
          dayStyles.dayText,
          isDisabled             && dayStyles.dayDisabled,
          isToday && !isSelected && dayStyles.dayToday,
          isSelected             && dayStyles.daySelected,
        ]}>
          {date.day}
        </Text>
      </View>

      {/* Stacked color bars — layout is always reserved so date numbers stay aligned */}
      <View style={dayStyles.barsArea}>
        {displayTags.map((tag) => <TagBar key={tag.id} tag={tag} />)}
        {hasOverflow && (
          <View style={[dayStyles.bar, { backgroundColor: '#555' }]} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const dayStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 5,
    paddingBottom: 4,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleSelected: { backgroundColor: '#00E5FF' },
  circleToday:    { borderWidth: 1.5, borderColor: '#00E5FF' },
  dayText:     { fontSize: 13, fontWeight: '600', color: '#fff' },
  dayToday:    { color: '#00E5FF', fontWeight: '700' },
  daySelected: { color: '#121212', fontWeight: '700' },
  dayDisabled: { color: '#444' },
  barsArea: {
    alignSelf: 'stretch',
    marginHorizontal: 2,
    marginTop: 3,
    gap: 2,
    // Fixed height regardless of bar count → keeps the date row stable
    minHeight: BAR_H * MAX_BARS + 2 * (MAX_BARS - 1),
  },
  bar: {
    height: BAR_H,
    borderRadius: 1.5,
  },
});

// ─── Tag Chip ─────────────────────────────────────────────────────────────────

function TagChip({ tag, active, onPress, onEdit }: {
  tag: Tag; active: boolean; onPress: () => void; onEdit: () => void;
}) {
  return (
    <View
      style={[
        styles.chip,
        active
          ? { backgroundColor: tag.color + '33', borderColor: tag.color }
          : { backgroundColor: '#1a1a1a', borderColor: '#333' },
      ]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.chipPressable}>
        <Text style={[styles.chipText, active && { color: tag.color, fontWeight: '700' }]}>
          {tag.emoji} {tag.label}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onEdit} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} activeOpacity={0.6}>
        <Ionicons name="pencil-outline" size={13} color={active ? tag.color : '#555'} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ tag, count, total }: { tag: Tag; count: number; total: number }) {
  const pct = Math.min(count / total, 1);
  return (
    <View style={statStyles.tile}>
      <View style={statStyles.tileHeader}>
        <Text style={statStyles.tileEmoji}>{tag.emoji}</Text>
        <Text style={statStyles.tileLabel} numberOfLines={1}>{tag.label}</Text>
        <Text style={[statStyles.tileCount, { color: tag.color }]}>{count} T.</Text>
      </View>
      {/* Progress bar */}
      <View style={statStyles.barBg}>
        <View style={[statStyles.barFill, { width: `${pct * 100}%` as `${number}%`, backgroundColor: tag.color }]} />
      </View>
    </View>
  );
}

const statStyles = StyleSheet.create({
  tile: {
    width: '48%',
    backgroundColor: '#252525',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileEmoji:  { fontSize: 16 },
  tileLabel:  { flex: 1, color: '#ccc', fontSize: 12, fontWeight: '600' },
  tileCount:  { fontSize: 13, fontWeight: '800' },
  barBg:      { height: 4, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  barFill:    { height: 4, borderRadius: 2 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#121212' },
  scroll: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 56, gap: 16 },
  header: { marginBottom: 4 },
  screenTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
    padding: 16,
    gap: 14,
  },
  calendar: { borderRadius: 12 },

  dateTitleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedDateText: { fontSize: 16, fontWeight: '700', color: '#00E5FF', letterSpacing: 0.2 },

  labelRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:       { fontSize: 11, fontWeight: '700', color: '#666', letterSpacing: 1, textTransform: 'uppercase' },
  addTagButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1,
    borderColor: '#00E5FF33', backgroundColor: '#00E5FF11',
  },
  addTagText: { color: '#00E5FF', fontSize: 12, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingLeft: 14, paddingRight: 10,
    borderRadius: 20, borderWidth: 1,
    borderColor: '#333', backgroundColor: '#1a1a1a',
  },
  chipPressable: { flexDirection: 'row', alignItems: 'center' },
  chipText: { color: '#aaa', fontSize: 13, fontWeight: '600' },

  noteInput: {
    backgroundColor: '#252525', borderRadius: 14, borderWidth: 1.5,
    borderColor: '#333', color: '#fff', fontSize: 14, padding: 14, minHeight: 100,
  },
  noteInputFocused: { borderColor: '#00E5FF' },

  saveButton: {
    backgroundColor: '#00E5FF', borderRadius: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveButtonText: { color: '#121212', fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },

  // Stats panel
  statsTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  statsMonth: { color: '#00E5FF', fontWeight: '700' },
  statsEmpty: { color: '#555', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  statsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: '#000000bb',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: '#1e1e1e',
    borderRadius: 20, borderWidth: 1, borderColor: '#2a2a2a', padding: 20, gap: 16,
  },
  modalTitle:  { fontSize: 17, fontWeight: '800', color: '#fff' },
  modalLabel:  { fontSize: 10, fontWeight: '700', color: '#666', letterSpacing: 1, textTransform: 'uppercase' },
  modalRow:    { flexDirection: 'row', gap: 10 },
  modalInput:  {
    backgroundColor: '#121212', borderRadius: 12, borderWidth: 1,
    borderColor: '#2a2a2a', color: '#fff', fontSize: 14, padding: 14,
  },
  emojiInput:  { width: 54, textAlign: 'center', fontSize: 22, padding: 10 },
  paletteRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  paletteColor:         { width: 34, height: 34, borderRadius: 17 },
  paletteColorSelected: { borderWidth: 3, borderColor: '#fff' },
  previewRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: '#444', alignItems: 'center',
  },
  modalCancelText: { color: '#aaa', fontWeight: '700', fontSize: 14 },
  modalSave: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  modalSaveText: { color: '#121212', fontWeight: '800', fontSize: 14 },
  modalDelete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  modalDeleteText: { color: '#FF5252', fontSize: 13, fontWeight: '600' },
});
