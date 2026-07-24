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
        } catch (e) {
            console.error('DB.save failed for key:', key, e);
            if (e.name === 'QuotaExceededError' || e.code === 22 || (e.message && e.message.indexOf('quota') !== -1)) {
                alert('Speicher voll: Der Browser-Speicher (localStorage) ist voll. Bitte lösche alte Daten oder nutze Export/Import.');
            } else {
                alert('Speichern fehlgeschlagen: ' + e.message);
            }
        }
        if (window.FilePersist) FilePersist.scheduleSave();
    },
    loadHolidays: function() { return this.load('holidays', []); },
    saveHolidays: function(holidays) { this.save('holidays', holidays); },
    loadAutonomousDays: function() { return this.load('autonomous_days', []); },
    saveAutonomousDays: function(days) { this.save('autonomous_days', days); },
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
            { id: '1', name: '4A GZ', subject: 'Geometrisches Zeichnen', type: 'gz', color: '#6366f1', firstLessonDate: '2025-09-15', lessonDays: ['Montag'] },
            { id: '2', name: '7B DG', subject: 'Darstellende Geometrie', type: 'dg', color: '#ec4899', firstLessonDate: '2026-07-14', lessonDays: ['Dienstag', 'Donnerstag'] },
            { id: '3', name: '1C Mathematik', subject: 'Mathematik', type: 'math', color: '#10b981', firstLessonDate: '2026-07-14', lessonDays: ['Montag', 'Mittwoch', 'Freitag'] }
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
            showHomework: true
        });
        this.saveClasses(classes);
    },
    deleteClass: function(id) {
        this.saveClasses(this.loadClasses().filter(c => c.id !== id));
        this.saveStudents(this.loadStudents().filter(s => s.classId !== id));
        this.clearClassData(id);
    },
    clearClassData: function(classId) {
        Object.keys(localStorage).filter(k => k.includes(classId)).forEach(k => localStorage.removeItem(k));
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
        students.push({ id: Date.now().toString(), classId: classId, name: name, lastName: lastName || '' });
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
    loadHideHolidayColumns: function() { return this.load('hide_holiday_columns', true); },
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
    addTeachingPlanEntry: function(classId, date, exerciseNr, exerciseContent, homeworkNr, homeworkContent, homeworkSheets, supplier) {
        const plan = this.loadTeachingPlan(classId);
        plan.push({ id: Date.now().toString(), date: date, exerciseNr: exerciseNr, exerciseContent: exerciseContent, homeworkNr: homeworkNr, homeworkContent: homeworkContent, homeworkSheets: homeworkSheets || '', supplier: supplier || false });
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
    exportAll: function() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k !== '_lastModified') data[k] = localStorage.getItem(k);
        }
        data._lastModified = new Date().toISOString();
        return JSON.stringify(data, null, 2);
    },
    importAll: function(json) {
        try {
            const data = JSON.parse(json);
            Object.keys(data).forEach(k => localStorage.setItem(k, data[k]));
        } catch (e) { console.error('importAll failed', e); }
    },
    clearSchoolData: function() {
        const keep = new Set([
            'holidays',
            'autonomous_days',
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
            'autonomous_days',
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

const FilePersist = {
    available: true,
    handle: null,
    _pending: false,
    _interval: null,
    scheduleSave: function() {
        if (this._pending) return;
        this._pending = true;
        setTimeout(() => { this._pending = false; this.saveToFile(); }, 1000);
    },
    startAutoSave: function() {
        if (this._interval) return;
        this._interval = setInterval(() => { this.saveToFile(); }, 30000);
    },
    stopAutoSave: function() {
        if (this._interval) { clearInterval(this._interval); this._interval = null; }
    },
    chooseFile: async function() {
        alert('Automatische Speicherung ist aktiv. Die Datei planit-daten.json im Hauptordner wird alle 30 Sekunden automatisch gespeichert und von OneDrive synchronisiert.');
        return true;
    },
    bootstrap: async function() {
        try {
            const response = await fetch('planit-daten.json', { method: 'GET', cache: 'no-store' });
            if (response.ok) {
                const text = await response.text();
                if (text && text.trim() !== '' && text.trim() !== '{}') {
                    DB.importAll(text);
                    console.log('FilePersist: Datei geladen.');
                }
            }
        } catch (e) { console.error('FilePersist.load failed', e); }
        this.startAutoSave();
    },
    saveToFile: async function() {
        try {
            const data = DB.exportAll();
            const response = await fetch('planit-daten.json', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: data,
                cache: 'no-store'
            });
            if (response.ok) {
                console.log('FilePersist: Gespeichert.');
            } else {
                console.error('FilePersist: Speichern fehlgeschlagen', response.status);
            }
        } catch (e) { console.error('FilePersist.saveToFile failed', e); }
    },
    loadFromFile: async function() {
        try {
            const response = await fetch('planit-daten.json', { method: 'GET', cache: 'no-store' });
            if (response.ok) {
                const text = await response.text();
                if (text && text.trim() !== '' && text.trim() !== '{}') {
                    DB.importAll(text);
                    console.log('FilePersist: Datei geladen.');
                }
            }
        } catch (e) { console.error('FilePersist.loadFromFile failed', e); }
    }
};
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