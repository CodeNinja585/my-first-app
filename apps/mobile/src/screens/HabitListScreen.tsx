import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { addHabit, listHabits, toggleLog, getLogsForDay, Habit } from '../db';
import { isValidDayKey } from '@app/shared';

const C = {
  bg: '#FAFAF9',
  surface: '#FFFFFF',
  border: '#E7E5E4',
  ink: '#1C1917',
  muted: '#78716C',
  faint: '#A8A29E',
  accent: '#15803D',
  accentSoft: '#F0FDF4',
  accentBorder: '#BBF7D0',
  track: '#E7E5E4',
};

function getTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function HabitListScreen() {
  const { isLoaded, isSignedIn, userId, signOut } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHabitName, setNewHabitName] = useState('');
  const [todayLogs, setTodayLogs] = useState<Set<string>>(new Set());

  const loadHabits = useCallback(async () => {
    setLoading(true);
    try {
      setHabits(await listHabits());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    void loadHabits();
  }, [isSignedIn, userId, loadHabits]);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    const load = async () => {
      const key = getTodayKey();
      if (!isValidDayKey(key)) return;
      try {
        const logs = await getLogsForDay(key);
        console.log('LOGS ON START', key, Array.from(logs));
        setTodayLogs(logs);
      } catch (error) {
        console.error('Failed to load today logs:', error);
      }
    };
    void load();
  }, [isSignedIn, userId]);

  const handleAddHabit = useCallback(async () => {
    const name = newHabitName.trim();
    if (!name) return;
    try {
      const id = await addHabit(name);
      setHabits((prev) => [{ id, name, created_at: new Date().toISOString() }, ...prev]);
      setNewHabitName('');
    } catch (error) {
      console.error('Failed to add habit:', error);
    }
  }, [newHabitName]);

  const handleToggle = useCallback(async (habit: Habit) => {
    const key = getTodayKey();
    if (!isValidDayKey(key)) return;
    setTodayLogs((prev) => {
      const next = new Set(prev);
      if (next.has(habit.id)) next.delete(habit.id);
      else next.add(habit.id);
      return next;
    });
    try {
      await toggleLog(habit.id, key);
    } catch (error) {
      console.error('Failed to toggle log:', error);
      setTodayLogs(await getLogsForDay(key));
    }
  }, []);

  if (!isLoaded) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (!isSignedIn || !userId) return <Redirect href="/sign-in" />;

  const total = habits.length;
  const done = habits.filter((h) => todayLogs.has(h.id)).length;
  const pct = total === 0 ? 0 : done / total;
  const allDone = total > 0 && done === total;

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={habits}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={s.greeting}>{greeting()}</Text>
            <Text style={s.title}>Today</Text>

            {total > 0 ? (
              <View style={s.progressBlock}>
                <View style={s.progressLabelRow}>
                  <Text style={s.progressCount}>
                    {done}
                    <Text style={s.progressTotal}> / {total}</Text>
                  </Text>
                  <Text style={[s.progressNote, allDone && s.progressNoteDone]}>
                    {allDone ? 'All done today' : `${total - done} left`}
                  </Text>
                </View>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${Math.round(pct * 100)}%` }]} />
                </View>
              </View>
            ) : null}

            <View style={s.addRow}>
              <TextInput
                style={s.input}
                placeholder="What do you want to build?"
                placeholderTextColor={C.faint}
                value={newHabitName}
                onChangeText={setNewHabitName}
                onSubmitEditing={() => void handleAddHabit()}
                returnKeyType="done"
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[s.addBtn, !newHabitName.trim() && s.addBtnOff]}
                onPress={() => void handleAddHabit()}
                disabled={!newHabitName.trim()}
                activeOpacity={0.85}
              >
                <Text style={s.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            {loading ? <ActivityIndicator style={s.loader} color={C.accent} /> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? undefined : (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Start with one</Text>
              <Text style={s.emptyBody}>
                Small and daily beats big and occasional. Add a habit above.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const isDone = todayLogs.has(item.id);
          return (
            <TouchableOpacity
              style={[s.card, isDone && s.cardDone]}
              onPress={() => void handleToggle(item)}
              activeOpacity={0.75}
            >
              <View style={[s.check, isDone && s.checkDone]}>
                {isDone ? <Text style={s.checkMark}>✓</Text> : null}
              </View>
              <Text style={[s.habitName, isDone && s.habitNameDone]} numberOfLines={2}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <TouchableOpacity style={s.footer} onPress={() => void signOut()}>
            <Text style={s.signOut}>Sign out</Text>
          </TouchableOpacity>
        }
      />
    </KeyboardAvoidingView>
  );
}

export default HabitListScreen;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  listContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 32 },

  greeting: { fontSize: 14, color: C.muted, marginBottom: 4 },
  title: { fontSize: 34, fontWeight: '700', color: C.ink, letterSpacing: -0.5 },

  progressBlock: { marginTop: 20, marginBottom: 24 },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressCount: { fontSize: 22, fontWeight: '700', color: C.ink },
  progressTotal: { fontSize: 16, fontWeight: '500', color: C.faint },
  progressNote: { fontSize: 13, color: C.muted },
  progressNoteDone: { color: C.accent, fontWeight: '600' },
  track: { height: 6, borderRadius: 3, backgroundColor: C.track, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: C.accent },

  addRow: { flexDirection: 'row', marginBottom: 20 },
  input: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 16,
    color: C.ink,
  },
  addBtn: {
    marginLeft: 10,
    backgroundColor: C.ink,
    borderRadius: 12,
    paddingHorizontal: 22,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnOff: { backgroundColor: C.border },
  addBtnText: { color: C.surface, fontSize: 16, fontWeight: '600' },
  loader: { marginTop: 24 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardDone: { backgroundColor: C.accentSoft, borderColor: C.accentBorder },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D6D3D1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkDone: { backgroundColor: C.accent, borderColor: C.accent },
  checkMark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  habitName: { flex: 1, fontSize: 17, color: C.ink, lineHeight: 23 },
  habitNameDone: { color: '#166534' },

  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: C.ink, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21 },

  footer: { alignItems: 'center', paddingTop: 28 },
  signOut: { fontSize: 14, color: C.faint },
});
