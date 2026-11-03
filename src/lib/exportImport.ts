import type { Note } from '../types/note';
import { getLocalNotes, saveLocalNotes } from './storage';

export function exportNotesToJson(): void {
  const notes = getLocalNotes();
  const exportData = {
    version: '1.0',
    export_date: new Date().toISOString(),
    app: '7NotPad',
    total_notes: notes.length,
    notes: notes,
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const dateFormatted = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = url;
  a.download = `7notpad-backup-${dateFormatted}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importNotesFromJson(file: File): Promise<{ success: boolean; count: number; error?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);

        let incomingNotes: Note[] = [];
        if (Array.isArray(parsed)) {
          incomingNotes = parsed;
        } else if (parsed && Array.isArray(parsed.notes)) {
          incomingNotes = parsed.notes;
        } else {
          return resolve({ success: false, count: 0, error: 'Formato de arquivo inválido.' });
        }

        const currentNotes = getLocalNotes();
        const existingIds = new Set(currentNotes.map(n => n.id));
        let addedCount = 0;

        for (const note of incomingNotes) {
          if (!note.id || !note.title) continue;
          if (existingIds.has(note.id)) {
            // Give a new id to avoid overwrite if id exists
            const cloned: Note = {
              ...note,
              id: crypto.randomUUID(),
              local_id: crypto.randomUUID(),
              title: `${note.title} (Importada)`,
              updated_at: new Date().toISOString()
            };
            currentNotes.unshift(cloned);
            addedCount++;
          } else {
            currentNotes.unshift(note);
            addedCount++;
          }
        }

        saveLocalNotes(currentNotes);
        resolve({ success: true, count: addedCount });
      } catch (err: any) {
        resolve({ success: false, count: 0, error: err?.message || 'Erro ao processar arquivo JSON.' });
      }
    };
    reader.onerror = () => {
      resolve({ success: false, count: 0, error: 'Erro ao ler o arquivo.' });
    };
    reader.readAsText(file);
  });
}
