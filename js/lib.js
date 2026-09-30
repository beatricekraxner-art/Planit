// --- Sicherheitsnetz ---------------------------------------------------
// Bevor Daten verändert werden, wird der aktuelle Stand gesichert. Damit
// kann kein Fehler in der Synchronisation Daten endgültig vernichten.
const SafetyNet = {
    snapshots: [],

    // Vergleicht nur die eigentlichen Daten, ohne Zeitstempel und Revision.
    // Sonst waere jeder 30-Sekunden-Speichervorgang eine "Aenderung".
    dataChanged: function (aText, bText) {
        if (!aText || !bText) return true;
        try {
            const strip = t => {
                const o = JSON.parse(t);
                Object.keys(o).forEach(k => { if (k.charAt(0) === '_') delete o[k]; });
                return JSON.stringify(o);
            };
            return strip(aText) !== strip(bText);
        } catch (e) { return aText !== bText; }
    },

    // Rohtext (z. B. der bisherige Dateiinhalt) sichern
    keep: function (text, reason) {
        if (!text || !text.trim() || text.trim() === '{}') return;
        this.snapshots.push(text);
        if (this.snapshots.length > 3) this.snapshots.shift();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const name = 'planit-snap-' + stamp + '.json';
        let body = text;
        try {
            const obj = JSON.parse(text);
            if (obj && typeof obj === 'object') {
                obj._safetyNote = (reason || 'Sicherung') + ' - ' + new Date().toISOString();
                body = JSON.stringify(obj, null, 2);
            }
        } catch (e) { }
        try {
            fetch(name, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: body,
                cache: 'no-store'
            }).catch(function () { });
        } catch (e) { }
    },

    // Lokalen Datenbestand sichern
    keepLocal: function (reason) {
        try { this.keep(DB.exportAll(), reason); } catch (e) { }
    }
};
window.SafetyNet = SafetyNet;

// --- Sitzungs-/Token-Schluessel gehoeren NICHT in die Daten- und Cloud-Datei ---
// (MSAL-Token, OneDrive-Token, Telemetrie). Sie wuerden sonst mit synchronisiert
// und bei jedem Geraetewechsel als Konflikt auftauchen.
function isSessionKey(k) {
    return !!k && (
        k.charAt(0) === '_' ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(k) ||
        k.indexOf('onedrive_session_token') === 0 ||
        k.indexOf('server-telemetry-') === 0
    );
}

// Zeitpunkt der letzten lokalen Aenderung (lebt nur lokal, nie in der Datei)
function localChangeStamp() {
    try { return localStorage.getItem('_lastLocalChange'); } catch (e) { return null; }
}
function touchLocalChange() {
    try { localStorage.setItem('_lastLocalChange', new Date().toISOString()); } catch (e) { }
}

const daysOfWeek = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
const DB = {
    load: function(key, defaultValue) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (e) {
            console.error('DB.load failed for key:', key, e);
            return defaultValue;
        }
    },
    save: function(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            touchLocalChange();
        } catch (e) {
            console.error('DB.save failed for key:', key, e);
            if (e.name === 'QuotaExceededError' || e.code === 22 || (e.message && e.message.indexOf('quota') !== -1)) {
                alertModal('Speicher voll: Der Browser-Speicher (localStorage) ist voll. Bitte lösche alte Daten oder nutze Export/Import.');
            } else {
                alertModal('Speichern fehlgeschlagen: ' + e.message);
            }
        }
        if (window.FilePersist) FilePersist.scheduleSave();
    },
    loadHolidays: function() { return this.load('holidays', []); },
    saveHolidays: function(holidays) { this.save('holidays', holidays); },
    loadManualHolidays: function() { return this.load('manual_holidays', []); },
    saveManualHolidays: function(list) { this.save('manual_holidays', list); },
    addManualHoliday: function(name, from, to) {
        const list = this.loadManualHolidays();
        list.push({ name: name, from: from, to: to });
        this.saveManualHolidays(list);
    },
    deleteManualHoliday: function(index) {
        const list = this.loadManualHolidays();
        if (index >= 0 && index < list.length) {
            list.splice(index, 1);
            this.saveManualHolidays(list);
        }
    },
    updateManualHoliday: function(index, name, from, to) {
        const list = this.loadManualHolidays();
        if (index >= 0 && index < list.length) {
            list[index] = { name: name, from: from, to: to };
            this.saveManualHolidays(list);
        }
    },
    loadTodos: function() { return this.load('todos', []); },
    saveTodos: function(todos) { this.save('todos', todos); },
    addTodo: function(text, dueDate) {
        const todos = this.loadTodos();
        todos.push({ id: Date.now().toString(), text: text, dueDate: dueDate || '', done: false });
        this.saveTodos(todos);
    },
    toggleTodo: function(id) {
        const todos = this.loadTodos();
        const todo = todos.find(t => t.id === id);
        if (todo) { todo.done = !todo.done; this.saveTodos(todos); }
    },
    deleteTodo: function(id) {
        const todos = this.loadTodos().filter(t => t.id !== id);
        this.saveTodos(todos);
    },
    saveTodoText: function(id, text) {
        const todos = DB.loadTodos();
        const todo = todos.find(t => t.id === id);
        if (todo) { todo.text = text.trim(); DB.saveTodos(todos); }
    },
    loadGlobalSettings: function() { return this.load('global_settings', { schoolYearStart: '', schoolYearEnd: '' }); },
    saveGlobalSettings: function(settings) { this.save('global_settings', settings); },
    fetchHolidays: async function(year) {
        try {
            const response = await fetch('https://date.nager.at/api/v3/PublicHolidays/' + year + '/AT-6');
            const data = await response.json();
            return data.map(h => ({ date: h.date, name: h.name, localName: h.localName }));
        } catch (e) { return this.loadHolidays() || []; }
    },
    loadClasses: function() {
        return this.load('classes', [
            { id: '1', name: '4A GZ', subject: 'Geometrisches Zeichnen', type: 'gz', color: '#6366f1', firstLessonDate: '2025-09-15', lessonDays: ['Montag'], collections: [] },
            { id: '2', name: '7B DG', subject: 'Darstellende Geometrie', type: 'dg', color: '#ec4899', firstLessonDate: '2026-07-14', lessonDays: ['Dienstag', 'Donnerstag'], collections: [] },
            { id: '3', name: '1C Mathematik', subject: 'Mathematik', type: 'math', color: '#10b981', firstLessonDate: '2026-07-14', lessonDays: ['Montag', 'Mittwoch', 'Freitag'], collections: [] }
        ]);
    },
    getSortedClasses: function() {
        return this.loadClasses().slice().sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    },
    saveClasses: function(classes) { this.save('classes', classes); },
    addClass: function(name, type, subject, color, firstLessonDate, lessonDays) {
        const classes = this.loadClasses();
        const subjects = { gz: 'Geometrisches Zeichnen', dg: 'Darstellende Geometrie', math: 'Mathematik', other: 'Allgemein' };
        const colors = { gz: '#6366f1', dg: '#ec4899', math: '#10b981', other: '#f59e0b' };
        const defaults = { gz: ['Montag'], dg: ['Dienstag'], math: ['Montag', 'Mittwoch', 'Freitag'], other: ['Dienstag'] };
        const mode = type === 'gz' ? 'gz' : (type === 'dg' ? 'dg' : (type === 'other' ? 'other' : 'mathe'));
        classes.push({
            id: Date.now().toString(),
            name: name,
            type: type,
            subject: subject || subjects[type] || name,
            color: color || colors[type] || '#6366f1',
            firstLessonDate: firstLessonDate || '',
            lessonDays: lessonDays || defaults[type] || ['Montag'],
            planMode: mode,
            showExams: type !== 'gz',
            showExerciseNr: type !== 'dg' && type !== 'other',
            showHomework: true,
            useDecimalGrades: false,
            events: [],
            collections: []
        });
        this.saveClasses(classes);
    },
    deleteClass: function(id) {
        this.saveClasses(this.loadClasses().filter(c => c.id !== id));
        this.saveStudents(this.loadStudents().filter(s => s.classId !== id));
        this.clearClassData(id);
    },
    deleteAllStudents: function(classId) {
        this.saveStudents(this.loadStudents().filter(s => s.classId !== classId));
    },
    clearClassData: function(classId) {
        Object.keys(localStorage).filter(k => k.includes(classId)).forEach(k => localStorage.removeItem(k));
    },
    addClassEvent: function(classId, event) {
        const classes = this.loadClasses();
        const cls = classes.find(c => c.id === classId);
        if (!cls) return;
        if (!cls.events) cls.events = [];
        cls.events.push({ id: Date.now().toString(), ...event });
        this.saveClasses(classes);
    },
    updateClassEvent: function(classId, eventId, data) {
        const classes = this.loadClasses();
        const cls = classes.find(c => c.id === classId);
        if (!cls || !cls.events) return;
        const idx = cls.events.findIndex(e => e.id === eventId);
        if (idx >= 0) { cls.events[idx] = { ...cls.events[idx], ...data }; this.saveClasses(classes); }
    },
    deleteClassEvent: function(classId, eventId) {
        const classes = this.loadClasses();
        const cls = classes.find(c => c.id === classId);
        if (!cls || !cls.events) return;
        cls.events = cls.events.filter(e => e.id !== eventId);
        this.saveClasses(classes);
    },
    loadStudents: function() { return this.load('students', []); },
    saveStudents: function(students) { this.save('students', students); },
    getStudentsForClass: function(classId) {
        return this.loadStudents().filter(s => s.classId === classId).sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
    },
    getStudentsSorted: function() {
        return this.loadStudents().sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
    },
    addStudent: function(classId, name, lastName) {
        const students = this.loadStudents();
        students.push({ id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 9), classId: classId, name: name, lastName: lastName || '' });
        this.saveStudents(students);
    },
    deleteStudent: function(id) { this.saveStudents(this.loadStudents().filter(s => s.id !== id)); },
    getTimetable: function() { return this.load('timetable', []); },
    saveTimetable: function(timetable) { this.save('timetable', timetable); },
    addTimetableEntry: function(entry) {
        const timetable = this.getTimetable();
        timetable.push({ id: Date.now().toString(), ...entry });
        this.saveTimetable(timetable);
    },
    deleteTimetableEntry: function(id) { this.saveTimetable(this.getTimetable().filter(e => e.id !== id)); },
    loadAppointments: function() { return this.load('appointments', []); },
    saveAppointments: function(list) { this.save('appointments', list); },
    addAppointment: function(appt) {
        const list = this.loadAppointments();
        list.push({ id: Date.now().toString(), ...appt });
        this.saveAppointments(list);
    },
    updateAppointment: function(id, data) {
        const list = this.loadAppointments();
        const idx = list.findIndex(a => a.id === id);
        if (idx >= 0) { list[idx] = { ...list[idx], ...data }; this.saveAppointments(list); }
    },
    deleteAppointment: function(id) { this.saveAppointments(this.loadAppointments().filter(a => a.id !== id)); },
    getSprechstunden: function() { return this.load('sprechstunden', []); },
    saveSprechstunden: function(sprechstunden) { this.save('sprechstunden', sprechstunden); },
    addSprechstunde: function(e) {
        const sprechstunden = this.getSprechstunden();
        sprechstunden.push({ id: Date.now().toString(), ...e });
        this.saveSprechstunden(sprechstunden);
    },
    deleteSprechstunde: function(id) { this.saveSprechstunden(this.getSprechstunden().filter(e => e.id !== id)); },
    loadShowFruehaufsicht: function() { return this.load('showFruehaufsicht', false); },
    saveShowFruehaufsicht: function(v) { this.save('showFruehaufsicht', v); },
    loadTimetableCutoff: function() { return this.load('timetable_cutoff', ''); },
    saveTimetableCutoff: function(v) { this.save('timetable_cutoff', v); },
    loadTimetableEndTime: function() { return this.load('timetable_end_time', '16:30'); },
    saveTimetableEndTime: function(v) { this.save('timetable_end_time', v); },
    loadHideHolidayColumns: function() { return this.load('hide_holiday_columns', false); },
    saveHideHolidayColumns: function(v) { this.save('hide_holiday_columns', v); },
    loadHwGradeThresholds: function() {
        return this.load('hw_grade_thresholds', { g1: 92, g2: 79, g3: 62, g4: 50 });
    },
    saveHwGradeThresholds: function(obj) { this.save('hw_grade_thresholds', obj); },
    loadWorksheets: function(classId) { return this.load('gz_worksheets_' + classId, []); },
    saveWorksheets: function(classId, list) { this.save('gz_worksheets_' + classId, list); },
    loadWorksheetStatus: function(classId) { return this.load('gz_worksheet_status_' + classId, {}); },
    saveWorksheetStatus: function(classId, obj) { this.save('gz_worksheet_status_' + classId, obj); },
    loadAttendance: function(classId) { return this.load('gz_attendance_' + classId, []); },
    saveAttendance: function(classId, list) { this.save('gz_attendance_' + classId, list); },
    loadPortfolioGrades: function(classId) { return this.load('gz_portfolio_' + classId, {}); },
    savePortfolioGrades: function(classId, obj) { this.save('gz_portfolio_' + classId, obj); },
    loadProjectGrades: function(classId) { return this.load('gz_project_' + classId, {}); },
    saveProjectGrades: function(classId, obj) { this.save('gz_project_' + classId, obj); },
    loadGZGradeWeights: function(classId) {
        return this.load('gz_weights_' + classId, { worksheets: 0.5, portfolio: 0.2, attendance: 0.15, project: 0.15 });
    },
    saveGZGradeWeights: function(classId, obj) { this.save('gz_weights_' + classId, obj); },
    loadForgotMaterial: function(classId) { return this.load('gz_forgotten_' + classId, {}); },
    saveForgotMaterial: function(classId, obj) { this.save('gz_forgotten_' + classId, obj); },
    loadTimeSlots: function() {
        const slots = this.load('time_slots', []);
        if (!slots.length) {
            return [
                { name: 'Frühaufsicht', start: '07:15', end: '07:35' },
                { name: '1. Stunde', start: '07:35', end: '08:25' },
                { name: 'Pause', start: '08:25', end: '08:30' },
                { name: '2. Stunde', start: '08:30', end: '09:20' },
                { name: 'Pause', start: '09:20', end: '09:25' },
                { name: '3. Stunde', start: '09:25', end: '10:15' },
                { name: 'Große Pause', start: '10:15', end: '10:30' },
                { name: '4. Stunde', start: '10:30', end: '11:20' },
                { name: 'Pause', start: '11:20', end: '11:25' },
                { name: '5. Stunde', start: '11:25', end: '12:15' },
                { name: '6. Stunde', start: '12:15', end: '13:05' },
                { name: 'Pause', start: '13:05', end: '13:10' },
                { name: '7. Stunde', start: '13:10', end: '14:00' },
                { name: '8. Stunde', start: '14:00', end: '14:50' },
                { name: '9. Stunde', start: '14:50', end: '15:40' },
                { name: '10. Stunde', start: '15:40', end: '16:30' }
            ];
        }
        return slots;
    },
    saveTimeSlots: function(slots) { this.save('time_slots', slots); },
    loadHwStatus: function(classId) { return this.load('hw_status_' + classId, {}); },
    saveHwStatus: function(classId, obj) { this.save('hw_status_' + classId, obj); },
    loadHwCorrected: function(classId) { return this.load('hw_corrected_' + classId, {}); },
    saveHwCorrected: function(classId, obj) { this.save('hw_corrected_' + classId, obj); },
    loadHwExpired: function(classId) { return this.load('hw_expired_' + classId, {}); },
    saveHwExpired: function(classId, obj) { this.save('hw_expired_' + classId, obj); },
    setHwStatus: function(classId, studentId, hwNr, status, collected) {
        const all = this.loadHwStatus(classId);
        if (!all[studentId]) all[studentId] = {};
        if (!all[studentId][hwNr]) all[studentId][hwNr] = {};
        if (status !== undefined) all[studentId][hwNr].status = status;
        if (collected !== undefined) all[studentId][hwNr].collected = collected;
        this.saveHwStatus(classId, all);
    },
    loadExams: function(classId) { return this.load('exams_' + classId, []); },
    saveExams: function(classId, exams) { this.save('exams_' + classId, exams); },
    loadExamRecords: function(classId) { return this.load('exam_records_' + classId, {}); },
    saveExamRecords: function(classId, records) { this.save('exam_records_' + classId, records); },
    setExamExamplePoints: function(classId, studentId, examId, exampleId, points) {
        const rec = this.loadExamRecords(classId);
        if (!rec[studentId]) rec[studentId] = {};
        if (!rec[studentId][examId]) rec[studentId][examId] = { examplePoints: {}, returned: false };
        rec[studentId][examId].examplePoints[exampleId] = points;
        this.saveExamRecords(classId, rec);
    },
    setExamReturned: function(classId, studentId, examId, returned) {
        const rec = this.loadExamRecords(classId);
        if (!rec[studentId]) rec[studentId] = {};
        if (!rec[studentId][examId]) rec[studentId][examId] = { examplePoints: {}, returned: false };
        rec[studentId][examId].returned = returned;
        this.saveExamRecords(classId, rec);
    },
    setExamAbsent: function(classId, studentId, examId, absent) {
        const rec = this.loadExamRecords(classId);
        if (!rec[studentId]) rec[studentId] = {};
        if (!rec[studentId][examId]) rec[studentId][examId] = { examplePoints: {}, returned: false };
        rec[studentId][examId].absent = !!absent;
        this.saveExamRecords(classId, rec);
    },
    loadPruefungen: function(classId) { return this.load('pruefungen_' + classId, []); },
    savePruefungen: function(classId, data) { this.save('pruefungen_' + classId, data); },
    loadPruefung: function(classId) { return this.load('pruefung_' + classId, {}); },
    savePruefung: function(classId, data) { this.save('pruefung_' + classId, data); },
    loadMitarbeit: function(classId) { return this.load('mitarbeit_' + classId, {}); },
    saveMitarbeit: function(classId, data) { this.save('mitarbeit_' + classId, data); },
    loadStudentNotes: function(classId) { return this.load('student_notes_' + classId, {}); },
    saveStudentNotes: function(classId, notes) { this.save('student_notes_' + classId, notes); },
    addExam: function(classId, title, examples, date) {
        const exams = this.loadExams(classId);
        const nr = exams.length ? Math.max(...exams.map(e => e.nr || 0)) + 1 : 1;
        const maxPoints = examples.reduce((s, e) => s + (parseInt(e.maxPoints) || 0), 0);
        exams.push({ id: Date.now().toString(), nr: nr, title: title, examples: examples, maxPoints: maxPoints, date: date, gradeScale: [] });
        this.saveExams(classId, exams);
    },
    deleteExam: function(classId, examId) {
        this.saveExams(classId, this.loadExams(classId).filter(e => e.id !== examId));
    },
    loadTeachingPlan: function(classId) { return this.load('teaching_plan_' + classId, []); },
    saveTeachingPlan: function(classId, plan) { this.save('teaching_plan_' + classId, plan); },
    addTeachingPlanEntry: function(classId, date, exerciseNr, exerciseContent, homeworkNr, homeworkContent, homeworkSheets, supplier, rowColor) {
        const plan = this.loadTeachingPlan(classId);
        plan.push({ id: Date.now().toString(), date: date, exerciseNr: exerciseNr, exerciseContent: exerciseContent, homeworkNr: homeworkNr, homeworkContent: homeworkContent, homeworkSheets: homeworkSheets || '', supplier: supplier || false, rowColor: rowColor || '' });
        this.saveTeachingPlan(classId, plan);
    },
    updateTeachingPlanEntry: function(classId, id, fields) {
        const plan = this.loadTeachingPlan(classId);
        const idx = plan.findIndex(p => p.id === id);
        if (idx >= 0) { Object.assign(plan[idx], fields); this.saveTeachingPlan(classId, plan); }
    },
    deleteTeachingPlanEntry: function(classId, id) {
        this.saveTeachingPlan(classId, this.loadTeachingPlan(classId).filter(p => p.id !== id));
    },
    nextLessonDate: function(classId, afterDate) {
        const cls = this.loadClasses().find(c => c.id === classId);
        const firstLessonDate = cls && cls.firstLessonDate ? cls.firstLessonDate : null;
        const lessonDays = cls && cls.lessonDays && cls.lessonDays.length ? cls.lessonDays : [];
        if (firstLessonDate && lessonDays.length === 1) {
            const start = afterDate ? new Date(afterDate) : new Date(firstLessonDate);
            start.setHours(0, 0, 0, 0);
            const base = new Date(firstLessonDate);
            base.setHours(0, 0, 0, 0);
            const diffDays = Math.round((start - base) / (1000 * 60 * 60 * 24));
            const weeks = Math.floor(diffDays / 7);
            const next = new Date(base);
            next.setDate(next.getDate() + (weeks + 1) * 7);
            const y = next.getFullYear();
            const m = String(next.getMonth() + 1).padStart(2, '0');
            const day = String(next.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + day;
        }
        const days = lessonDays.length ? lessonDays : this.loadLessonDays(classId);
        if (!days.length) return null;
        const order = { Montag: 1, Dienstag: 2, Mittwoch: 3, Donnerstag: 4, Freitag: 5 };
        const start = afterDate ? new Date(afterDate) : getMonday(new Date());
        start.setHours(0, 0, 0, 0);
        for (let i = 0; i < 400; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            const dayName = daysOfWeek[d.getDay() === 0 ? 6 : d.getDay() - 1];
            if (days.indexOf(dayName) !== -1) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return y + '-' + m + '-' + day;
            }
        }
        return null;
    },
    loadLessonDays: function(classId) {
        const timetable = this.getTimetable();
        const days = [];
        timetable.forEach(e => { if (e.classId === classId && days.indexOf(e.day) === -1) days.push(e.day); });
        return days;
    },
    loadProjects: function(classId) { return this.load('projects_' + classId, []); },
    saveProjects: function(classId, projects) { this.save('projects_' + classId, projects); },
    addProject: function(classId, title) {
        const projects = this.loadProjects(classId);
        projects.push({ id: Date.now().toString(), title: title });
        this.saveProjects(classId, projects);
    },
    deleteProject: function(classId, projectId) {
        this.saveProjects(classId, this.loadProjects(classId).filter(p => p.id !== projectId));
    },
    loadSemesterCutoff: function(classId) { return this.load('semester_cutoff_' + classId, ''); },
    saveSemesterCutoff: function(classId, val) { this.save('semester_cutoff_' + classId, val); },
    loadWeights: function(classId) { return this.load('weights_' + classId, { hw: 0.5, exam: 0.5, pruef: 0.5, mit: 1, project: 1 }); },
    saveWeights: function(classId, w) { this.save('weights_' + classId, w); },
    loadManualGrades: function(classId) { return this.load('manual_grades_' + classId, {}); },
    saveManualGrades: function(classId, m) { this.save('manual_grades_' + classId, m); },
    loadSemesterManualGrades: function(classId) {
        const sem = this.load('semester_manual_grades_' + classId, {});
        if (Object.keys(sem).length > 0) return sem;
        const legacy = this.load('manual_grades_' + classId, {});
        return legacy || {};
    },
    saveSemesterManualGrades: function(classId, m) { this.save('semester_manual_grades_' + classId, m); },
    loadSemesterRemarks: function(classId) { return this.load('semester_remarks_' + classId, {}); },
    saveSemesterRemarks: function(classId, m) { this.save('semester_remarks_' + classId, m); },
    loadOverviewNoteComments: function(classId) { return this.load('overview_note_comments_' + classId, {}); },
    saveOverviewNoteComments: function(classId, m) { this.save('overview_note_comments_' + classId, m); },
    loadSemesterOverviewNoteComments: function(classId) { return this.load('semester_overview_note_comments_' + classId, {}); },
    saveSemesterOverviewNoteComments: function(classId, m) { this.save('semester_overview_note_comments_' + classId, m); },
    exportAll: function(meta) {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && !isSessionKey(k)) data[k] = localStorage.getItem(k);
        }
        data._lastModified = new Date().toISOString();
        if (meta && typeof meta === 'object') {
            Object.keys(meta).forEach(k => { data[k] = meta[k]; });
        }
        return JSON.stringify(data, null, 2);
    },
    importAll: function(json) {
        try {
            const data = JSON.parse(json);
            Object.keys(data).forEach(k => {
                if (isSessionKey(k)) return; // keine Token in localStorage importieren
                localStorage.setItem(k, data[k]);
            });
        } catch (e) { console.error('importAll failed', e); }
    },
    snapshot: function() {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && !isSessionKey(k)) out[k] = localStorage.getItem(k);
        }
        return out;
    },
    clearSchoolData: function() {
        const keep = new Set([
            'holidays',
            'global_settings',
            'time_slots',
            'show_fruehaufsicht',
            'timetable_cutoff',
            'timetable_end_time',
            'hide_holiday_columns',
            'hw_grade_thresholds'
        ]);
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && !keep.has(k)) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
    },
    exportSchoolDataOnly: function() {
        const keep = new Set([
            'holidays',
            'global_settings',
            'time_slots',
            'show_fruehaufsicht',
            'timetable_cutoff',
            'timetable_end_time',
            'hide_holiday_columns',
            'hw_grade_thresholds'
        ]);
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && !keep.has(k)) data[k] = localStorage.getItem(k);
        }
        return JSON.stringify(data, null, 2);
    }
};
window.db = DB;
window.DB = DB;

// ---------------------------------------------------------------------------
// SyncGuard: schützt vor Überschreiben durch ein zweites, gleichzeitig
// geöffnetes Gerät (Tablet/PC) und führt beim Speichern einen Merge durch,
// damit Änderungen von beiden Geräten erhalten bleiben.
// ---------------------------------------------------------------------------
const SyncGuard = {
    LOCK_NAME: 'planit-lock.json',
    LOCK_STALE_MS: 120000,

    deviceId: (function () {
        let id = null;
        try { id = localStorage.getItem('_syncDeviceId'); } catch (e) { }
        if (!id) {
            id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
            try { localStorage.setItem('_syncDeviceId', id); } catch (e) { }
        }
        return id;
    })(),

    deviceLabel: (function () {
        try {
            const p = navigator.platform || '';
            return p ? p.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) : 'Gerät';
        } catch (e) { return 'Gerät'; }
    })(),

    _base: null,        // Stand, den wir zuletzt gelesen/geschrieben haben
    _baseRev: null,
    _otherDevice: null,
    _lastWriteAt: 0,    // Zeitpunkt unseres letzten erfolgreichen Schreibens
    _writeFile: null,   // von Provider gesetzt: (name, text) => Promise
    _lockHeld: false,

    _meta: function () {
        return {
            _rev: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
            _device: this.deviceLabel,
            _deviceId: this.deviceId
        };
    },

    notify: function (level, text) {
        console.log('[SyncGuard]', level, text);
        try {
            if (typeof window.onSyncNotice === 'function') window.onSyncNotice({ level: level, text: text });
            window.dispatchEvent(new CustomEvent('sync-notice', { detail: { level: level, text: text } }));
        } catch (e) { }
    },

    // Stand aus der Datei übernehmen (nach jedem erfolgreichen Lesen)
    setRemoteSnapshot: function (remoteObj) {
        if (!remoteObj || typeof remoteObj !== 'object') return;
        const snap = {};
        Object.keys(remoteObj).forEach(k => { if (!isSessionKey(k)) snap[k] = remoteObj[k]; });
        this._base = snap;
        this._baseRev = remoteObj._rev || null;
    },

    // Übernimmt niemals Löschungen: der Merge entscheidet bereits, was gilt.
    applySnapshot: function (snap) {
        if (!snap) return;
        Object.keys(snap).forEach(k => {
            try { localStorage.setItem(k, snap[k]); } catch (e) { }
        });
    },

    // Werte aus localStorage sind bei jedem Parsen neue Objekte.
    // Referenzvergleich würde daher jede Änderung wie einen Konflikt aussehen
    // lassen, deshalb inhaltlich vergleichen.
    sameValue: function (a, b) {
        if (a === b) return true;
        if (a === null || b === null) return false;
        if (typeof a !== 'object' || typeof b !== 'object') return false;
        try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
    },

    // 3-Wege-Merge über einzelne Schlüssel.
    // Grundregel: lokale Daten werden NIE verworfen. Im Zweifel gewinnt die
    // lokale Änderung, weil ein Verlust von Arbeitsständen nicht rückgängig
    // zu machen ist, während der entfernte Stand in der Wiederherstellungs-
    // datei landet.
    merge: function (base, ours, theirs) {
        const keys = {};
        [base, ours, theirs].forEach(s => { if (s) Object.keys(s).forEach(k => { keys[k] = 1; }); });
        const merged = {};
        const conflicts = [];
        const same = this.sameValue;
        Object.keys(keys).forEach(k => {
            const hasBase = base ? Object.prototype.hasOwnProperty.call(base, k) : false;
            const hasOurs = Object.prototype.hasOwnProperty.call(ours, k);
            const hasTheirs = Object.prototype.hasOwnProperty.call(theirs, k);
            const b = base ? base[k] : undefined;
            const o = ours[k];
            const t = theirs[k];
            if (same(o, t)) { if (o !== undefined) merged[k] = o; return; }

            const oursChanged = hasBase ? !same(o, b) : hasOurs;
            const theirsChanged = hasBase ? !same(t, b) : hasTheirs;

            if (!oursChanged && hasTheirs) { merged[k] = t; return; }
            if (!theirsChanged) { if (hasOurs) merged[k] = o; return; }

            // Beide Seiten haben geändert -> Konflikt.
            // Lokal behalten, entfernten Stand separat sichern.
            conflicts.push(k);
            if (hasOurs) merged[k] = o;
        });
        return { merged: merged, conflicts: conflicts, remote: theirs };
    },

    // Vor dem Speichern entscheiden: normal, blind oder gemergt
    prepareSave: function (remoteText) {
        const ours = DB.snapshot();
        const meta = this._meta();
        let remoteObj = null;
        try { remoteObj = remoteText ? JSON.parse(remoteText) : null; } catch (e) { }

        if (!remoteObj || typeof remoteObj !== 'object') {
            return { payload: DB.exportAll(meta), mode: 'plain', conflicts: [] };
        }
        const remoteRev = remoteObj._rev || null;
        if (this._baseRev && remoteRev === this._baseRev) {
            return { payload: DB.exportAll(meta), mode: 'plain', conflicts: [] };
        }
        const remoteSnap = {};
        Object.keys(remoteObj).forEach(k => { if (!isSessionKey(k)) remoteSnap[k] = remoteObj[k]; });

        // Veraltungsschutz: ist die Datei juenger als unser letzter Schreibvorgang,
        // darf sie uebernommen werden. Sonst gehoeren ihre Werte zu einer
        // aelteren Sitzung und wuerden Stunden an Arbeit ueberschreiben.
        const remoteTime = Date.parse(remoteObj._lastModified || '') || 0;
        // Nach einem Neustart ist _lastWriteAt leer; dann gilt der Zeitpunkt
        // der letzten lokalen Aenderung als Anker.
        const reference = this._lastWriteAt || Date.parse(localChangeStamp() || '') || 0;
        if (reference && remoteTime && reference > remoteTime) {
            return {
                payload: DB.exportAll(meta), mode: 'local-newer',
                conflicts: [], localWins: true
            };
        }

        const baseSnap = this._base || {};
        const res = this.merge(baseSnap, ours, remoteSnap);

        if (res.conflicts.length && this._writeFile) {
            // Der entfernte Stand wird nicht angewendet -> separat sichern,
            // damit auch die andere Geraeteseite nicht verloren geht.
            // Format wie die Datendatei, damit die Datei direkt einsetzbar ist.
            const name = 'planit-recovery-stand-vom-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
            try {
                const rec = {};
                Object.keys(res.remote).forEach(k => { rec[k] = res.remote[k]; });
                rec._lastModified = remoteObj._lastModified || '';
                rec._rev = remoteObj._rev || '';
                rec._device = remoteObj._device || '';
                rec._deviceId = remoteObj._deviceId || '';
                rec._note = 'Widerspruechlicher Stand eines anderen Geraets vom ' +
                    (remoteObj._lastModified || 'unbekannt') + '. Nicht angewendet, weil lokal neuere ' +
                    'Daten vorlagen. Um ihn zu nutzen: Datei als planit-daten.json neben die App legen.';
                rec._conflicts = res.conflicts;
                Promise.resolve(this._writeFile(name, JSON.stringify(rec, null, 2)))
                    .catch(function () { });
            } catch (e) { }
        }

        const payloadObj = {};
        Object.keys(res.merged).forEach(k => { payloadObj[k] = res.merged[k]; });
        payloadObj._lastModified = new Date().toISOString();
        payloadObj._rev = meta._rev;
        payloadObj._device = meta._device;
        payloadObj._deviceId = meta._deviceId;

        return {
            payload: JSON.stringify(payloadObj, null, 2),
            mode: res.conflicts.length ? 'conflict' : 'merged',
            conflicts: res.conflicts,
            merged: res.merged,
            otherDevice: !!(remoteObj._deviceId && remoteObj._deviceId !== this.deviceId)
        };
    },

    afterSave: function (plan, remoteText) {
        let remoteObj = null;
        try { remoteObj = JSON.parse(plan.payload); } catch (e) { }
        this._lastWriteAt = Date.parse((remoteObj && remoteObj._lastModified) || '') || Date.now();
        if (plan.mode === 'plain' || plan.mode === 'local-newer') {
            // Der eben hochgeladene Stand ist ab jetzt unser Ausgangsstand.
            // Ohne das wüsste ein Gerät, das die Datei angelegt hat, seinen
            // eigenen Stand nicht mehr und meldete später Scheinkonflikte.
            this.setRemoteSnapshot(remoteObj);
            return;
        }
        // lokalen Stand auf den gemergten Stand bringen
        if (plan.mode !== 'plain') {
            SafetyNet.keepLocal('Lokale Daten vor dem Zusammenfuehren mit einem anderen Geraet');
        }
        try { this.applySnapshot(plan.merged); } catch (e) { }
        this.setRemoteSnapshot(remoteObj);
        if (plan.mode === 'conflict') {
            this.notify('warn', 'Ein anderes Gerät hatte eine abweichende Version gespeichert. ' +
                'Deine neuesten Daten wurden behalten. Der fremde Stand liegt als ' +
                '"planit-recovery-stand-vom-...json" im Plan-it-Ordner.');
        } else if (plan.otherDevice) {
            this.notify('info', 'Änderungen eines anderen Geräts wurden ergänzt. Deine Daten wurden behalten.');
        }
        try { window.dispatchEvent(new CustomEvent('sync-merged')); } catch (e) { }
    },

    setWriter: function (fn) { this._writeFile = fn; },

    // Sicheres Uebernehmen einer gelesenen Datei beim Start.
    // Ist der lokale Stand juenger als die Datei, wird NICHT importiert:
    // sonst ueberschreibt eine aeltere Sicherung Stunden an Arbeit.
    adoptRemote: function (remoteText) {
        if (!remoteText || !remoteText.trim() || remoteText.trim() === '{}') return false;
        let obj = null;
        try { obj = JSON.parse(remoteText); } catch (e) { return false; }
        if (!obj || typeof obj !== 'object') return false;

        const remoteTime = Date.parse(obj._lastModified || '') || 0;
        const localTime = Math.max(Date.parse(localChangeStamp() || '') || 0, this._lastWriteAt || 0);
        if (localTime && remoteTime && localTime > remoteTime) {
            this.notify('warn', 'Die gespeicherte Datei ist älter als deine letzten Änderungen. ' +
                'Es wurde nichts überschrieben; deine Daten bleiben erhalten. ' +
                'Die Datei liegt weiterhin im Plan-it-Ordner.');
            if (this._writeFile) {
                const name = 'planit-recovery-stand-vom-' +
                    String(obj._lastModified || 'unbekannt').replace(/[:.]/g, '-') + '.json';
                try { Promise.resolve(this._writeFile(name, remoteText)).catch(function () { }); } catch (e) { }
            }
            return false;
        }
        // Nur sichern, wenn die Datei den lokalen Stand tatsaechlich veraendert.
        try {
            const remoteData = {};
            Object.keys(obj).forEach(k => { if (!isSessionKey(k)) remoteData[k] = obj[k]; });
            const same = (function (a, b) {
                if (a === b) return true;
                try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
            });
            const lokal = DB.snapshot();
            const ka = Object.keys(remoteData), kb = Object.keys(lokal);
            const unterschied = ka.length !== kb.length || ka.some(k => !same(remoteData[k], lokal[k]));
            if (unterschied) SafetyNet.keepLocal('Lokale Daten vor dem Uebernahme einer Datei');
        } catch (e) { }

        DB.importAll(remoteText);
        this.setRemoteSnapshot(obj);
        return true;
    },

    // --- Gerät-Sperre (A) ---
    acquireLock: async function (readLock, writeLock, delLock) {
        this._readLock = readLock;
        this._writeLock = writeLock;
        this._delLock = delLock;
        try {
            const text = await readLock();
            if (text) {
                let ex = null;
                try { ex = JSON.parse(text); } catch (e) { }
                const now = Date.now();
                if (ex && ex.deviceId && ex.deviceId !== this.deviceId && (now - (ex.lastSeen || 0)) < this.LOCK_STALE_MS) {
                    this._otherDevice = ex;
                    this.notify('warn', 'Plan-it ist gerade auf einem anderen Gerät geöffnet (' +
                        (ex.device || 'unbekannt') + '). Änderungen hier können dort überschrieben werden.');
                }
            }
        } catch (e) { }
        await this.refreshLock();
        if (this._lockTimer) clearInterval(this._lockTimer);
        this._lockTimer = setInterval(() => { this.refreshLock(); }, 40000);
        window.addEventListener('beforeunload', () => { this.releaseLock(); });
    },

    refreshLock: async function () {
        if (!this._writeLock) return;
        try {
            const now = Date.now();
            await this._writeLock(JSON.stringify({
                deviceId: this.deviceId,
                device: this.deviceLabel,
                startedAt: this._lockStarted || (this._lockStarted = now),
                lastSeen: now
            }));
            this._lockHeld = true;
        } catch (e) { }
    },

    releaseLock: function () {
        if (this._delLock) { try { Promise.resolve(this._delLock()).catch(function () { }); } catch (e) { } }
        if (this._lockTimer) { clearInterval(this._lockTimer); this._lockTimer = null; }
    },

    hasOtherDevice: function () { return !!this._otherDevice; }
};
window.SyncGuard = SyncGuard;

let FilePersist = {
    available: true,
    handle: null,
    _pending: false,
    _saveTimeout: null,
    _interval: null,
    scheduleSave: function() {
        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        this._pending = true;
        this._saveTimeout = setTimeout(() => { this._pending = false; this._saveTimeout = null; this.saveToFile(); }, 100);
    },
    flush: function() {
        if (this._saveTimeout) { clearTimeout(this._saveTimeout); this._saveTimeout = null; this._pending = false; }
        this.saveToFile();
    },
    startAutoSave: function() {
        if (this._interval) return;
        this._interval = setInterval(() => { this.saveToFile(); }, 30000);
    },
    stopAutoSave: function() {
        if (this._interval) { clearInterval(this._interval); this._interval = null; }
    },
    chooseFile: async function() {
        alertModal('Automatische Speicherung ist aktiv. Die Datei planit-daten.json im Ordner "Plan-it" (OneDrive-Ordner oder Anwendungsordner) wird automatisch gespeichert und zwischen Geräten synchronisiert.');
        return true;
    },
    bootstrap: async function() {
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch('planit-daten.json', { method: 'GET', cache: 'no-store' });
                if (response.ok) {
                    const text = await response.text();
                    if (SyncGuard.adoptRemote(text)) {
                        console.log('FilePersist: Datei geladen (Versuch ' + attempt + ').');
                    }
                }
                await SyncGuard.acquireLock(
                    () => fetch('planit-lock.json', { method: 'GET', cache: 'no-store' }).then(r => r.ok ? r.text() : null).catch(() => null),
                    (txt) => fetch('planit-lock.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: txt, cache: 'no-store' }),
                    () => fetch('planit-lock.json', { method: 'DELETE', cache: 'no-store' }).catch(() => null)
                );
                // Ohne diesen Abgleich bemerkt eine offene App nie, was ein
                // anderes Geraet gespeichert hat.
                this.startAutoSave();
                return;
            } catch (e) {
                lastError = e;
                console.error('FilePersist.load failed (Versuch ' + attempt + '):', e);
                if (attempt < 3) await new Promise(r => setTimeout(r, 800 * attempt));
            }
        }
        console.error('FilePersist.load endgültig fehlgeschlagen:', lastError);
        // Auch bei Fehlern weiterlaufen: die App soll speichern können.
        this.startAutoSave();
    },
    _saving: false,
    saveToFile: async function() {
        if (this._saving) return;
        this._saving = true;
        try {
            let remoteText = null;
            try {
                const resp = await fetch('planit-daten.json', { method: 'GET', cache: 'no-store' });
                if (resp.ok) remoteText = await resp.text();
            } catch (e) { console.error('FilePersist: Vorschau nicht lesbar', e); }

            // Ist die Datei bereits identisch, gibt es nichts zu schreiben.
            // Das spart OneDrive einen Upload alle 30 Sekunden und verhindert
            // Konflikte, die durch pausenloses Ueberschreiben entstehen.
            if (remoteText && !SafetyNet.dataChanged(remoteText, DB.exportAll(SyncGuard._meta()))) {
                let gleich = null;
                try { gleich = JSON.parse(remoteText); } catch (e) { }
                SyncGuard.setRemoteSnapshot(gleich);
                console.log('FilePersist: Datei bereits aktuell, kein Schreiben nötig.');
                return;
            }

            const plan = SyncGuard.prepareSave(remoteText);
            // Was gerade ersetzt wird, wird vorher gesichert - aber nur wenn sich
            // wirklich Daten geaendert haben, sonst waere alle 30 Sekunden eine Kopie.
            if (remoteText && SafetyNet.dataChanged(remoteText, plan.payload)) {
                SafetyNet.keep(remoteText, 'Dateiinhalt vor dem Ueberschreiben');
            }
            const response = await fetch('planit-daten.json', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: plan.payload,
                cache: 'no-store'
            });
            if (response.ok) {
                SyncGuard.afterSave(plan, remoteText);
                console.log('FilePersist: Gespeichert (' + plan.mode + ').');
            } else {
                console.error('FilePersist: Speichern fehlgeschlagen', response.status);
            }
        } catch (e) { console.error('FilePersist.saveToFile failed', e); }
        finally { this._saving = false; }
    },
    loadFromFile: async function() {
        try {
            const response = await fetch('planit-daten.json', { method: 'GET', cache: 'no-store' });
            if (response.ok) {
                const text = await response.text();
                if (SyncGuard.adoptRemote(text)) {
                    console.log('FilePersist: Datei geladen.');
                }
            }
        } catch (e) { console.error('FilePersist.loadFromFile failed', e); }
    }
};
FilePersist.setWriter = function (name, text) {
    return fetch(name, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: text,
        cache: 'no-store'
    });
};
SyncGuard.setWriter(function (name, text) { return FilePersist.setWriter(name, text); });
window.FilePersist = FilePersist;
window.LocalPersist = FilePersist;

function defaultGradeScale() {
    return [
        { grade: 1, minPoints: null, maxPoints: null },
        { grade: 2, minPoints: null, maxPoints: null },
        { grade: 3, minPoints: null, maxPoints: null },
        { grade: 4, minPoints: null, maxPoints: null },
        { grade: 5, minPoints: null, maxPoints: null }
    ];
}