const UndoManager = {
    stack: [],
    index: -1,
    max: 20,
    push(state, description) {
        this.stack = this.stack.slice(0, this.index + 1);
        this.stack.push({ state: JSON.parse(JSON.stringify(state)), description: description || 'Aktion', time: Date.now() });
        if (this.stack.length > this.max) this.stack.shift();
        else this.index++;
        this.updateUI();
    },
    undo() {
        if (this.index < 0) return;
        this.index--;
        this.apply(this.stack[this.index]);
        this.updateUI();
    },
    redo() {
        if (this.index >= this.stack.length - 1) return;
        this.index++;
        this.apply(this.stack[this.index]);
        this.updateUI();
    },
    apply(entry) {
        if (!entry || !entry.state) return;
        try {
            DB.importAll(JSON.stringify(entry.state));
            if (typeof renderDashboard === 'function') renderDashboard();
            if (typeof renderClasses === 'function') renderClasses();
            if (typeof renderGrading === 'function') renderGrading();
            if (typeof renderGradesOverview === 'function') renderGradesOverview();
            if (typeof renderTodos === 'function') renderTodos();
        } catch (e) { console.error('Undo apply failed', e); }
    },
    canUndo() { return this.index >= 0; },
    canRedo() { return this.index < this.stack.length - 1; },
    updateUI() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        if (undoBtn) undoBtn.disabled = !this.canUndo();
        if (redoBtn) redoBtn.disabled = !this.canRedo();
    },
    capture() {
        try {
            const state = {};
            const keys = ['classes', 'students', 'timetable', 'teaching_plan', 'hw_status', 'hw_corrected', 'hw_expired', 'exams', 'exam_records', 'pruefung', 'pruefungen', 'mitarbeit', 'manual_grades', 'semester_manual_grades', 'project_grades', 'gz_worksheet_status', 'gz_portfolio', 'gz_project', 'gz_weights', 'gz_forgotten', 'todos'];
            keys.forEach(k => { state[k] = localStorage.getItem(k); });
            this.push(state);
        } catch (e) { console.error('Undo capture failed', e); }
    }
};
window.UndoManager = UndoManager;

document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        UndoManager.undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault();
        UndoManager.redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        UndoManager.redo();
    }
});
