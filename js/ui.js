function showLoading(text) {
    const el = document.getElementById('loading-overlay');
    if (el) {
        el.style.display = 'inline-flex';
        const txt = el.querySelector('.loading-text');
        if (txt && text) txt.textContent = text;
    }
}
function hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = 'none';
}
function setSaveStatus(text) {
    const el = document.getElementById('save-status');
    if (el) el.textContent = text || 'Bereit';
}

function captureUndo() {
    try { if (window.UndoManager && window.UndoManager.capture) window.UndoManager.capture(); } catch (e) {}
}

function isValidGrade(val) {
    if (val === '' || val === null || val === undefined) return true;
    const n = parseInt(val, 10);
    return !isNaN(n) && n >= 1 && n <= 5;
}

function markInvalidGradeInputs(container) {
    if (!container) return;
    container.querySelectorAll('.grade-input').forEach(inp => {
        if (!isValidGrade(inp.value)) inp.classList.add('invalid');
        else inp.classList.remove('invalid');
    });
}

function validateGradeInputs(container) {
    if (!container) return false;
    let valid = true;
    container.querySelectorAll('.grade-input').forEach(inp => {
        if (!isValidGrade(inp.value)) {
            inp.classList.add('invalid');
            valid = false;
        } else {
            inp.classList.remove('invalid');
        }
    });
    return valid;
}

window.exportGradesCSV = function() {
    const classes = DB.getSortedClasses();
    classes.forEach(cls => {
        const students = DB.getStudentsForClass(cls.id);
        if (!students.length) return;
        const classId = cls.id;
        const worksheets = getGZPlannedWorksheets(classId);
        const status = DB.loadWorksheetStatus(classId);
        const weights = DB.loadGZGradeWeights(classId);
        const mitarbeit = DB.loadMitarbeit(classId);
        const project = DB.loadProjectGrades(classId);
        const semesterManual = DB.loadSemesterManualGrades(classId);
        const isYear = gradeOverviewScope === 'year';
        const lines = ['Schüler;Ø ÜB;Mappe 1. Sem.;Fehlend;Laptop vergessen;Berechnet;Note (1. Sem.)'];
        if (isYear) lines[0] += ';Projekt;Note (Jahr)';
        students.forEach(s => {
            const st = status[s.id] || {};
            const m = mitarbeit[s.id] || {};
            let wsSum = 0, wsCount = 0, missingCount = 0, laptopCount = 0;
            worksheets.forEach(w => {
                const cell = st[w.nr] || {};
                const grade = cell.grade || '';
                if (grade && grade !== 'missing') { wsSum += parseFloat(grade); wsCount++; }
                else if (grade === '' || grade === 'missing') missingCount++;
            });
            const avg = wsCount > 0 ? (wsSum / wsCount).toFixed(2) : '';
            const folder = m.folder1 != null ? m.folder1 : '';
            const pr = project[s.id] || {};
            const proj = pr.grade != null ? pr.grade : '';
            const manualGrade = semesterManual[s.id] != null ? semesterManual[s.id] : '';
            let sum = 0, totalWeight = 0;
            if (wsCount > 0) { sum += wsSum; totalWeight += wsCount; }
            const folderGrade = parseFloat(m.folder1);
            if (weights.portfolio && !isNaN(folderGrade)) { sum += folderGrade * weights.portfolio; totalWeight += weights.portfolio; }
            const attendanceGrade = parseFloat(st.attendance);
            if (weights.attendance && !isNaN(attendanceGrade)) { sum += attendanceGrade * weights.attendance; totalWeight += weights.attendance; }
            const projectGrade = parseFloat(st.project);
            if (weights.project && !isNaN(projectGrade)) { sum += projectGrade * weights.project; totalWeight += weights.project; }
            const computed = totalWeight > 0 ? (sum / totalWeight).toFixed(2) : '';
            const forgot = getGZForgottenCounts(classId, s.id);
            const forgotMat = forgot.material || 0;
            const forgotLap = forgot.laptop || 0;
            const name = s.name.replace(/"/g, '""');
            let row = '"' + name + '";' + avg + ';' + folder + ';' + forgotMat + ';' + forgotLap + ';' + computed + ';' + manualGrade;
            if (isYear) row += ';' + proj + ';' + manualGrade;
            lines.push(row);
        });
        const csv = lines.join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'notenuebersicht_' + cls.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
};

function subjectAbbr(subject) {
    if (!subject) return '';
    const s = subject.toLowerCase();
    if (s.indexOf('mathematik') !== -1) return 'M';
    if (s.indexOf('darstellende geometrie') !== -1 || s.indexOf('dg') !== -1) return 'DG';
    if (s.indexOf('geometrisches zeichnen') !== -1 || s.indexOf('gz') !== -1) return 'GZ';
    return subject;
}

function showModal(content) {
    const modal = document.getElementById('modal-overlay');
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = content;
    modal.style.display = 'flex';
}

function hideModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    document.getElementById(viewName + '-view').classList.add('active');
    const target = document.querySelector('.nav-links li[data-view="' + viewName + '"]');
    if (target) target.classList.add('active');
    const viewTitles = {
        dashboard: 'Stundenplan',
        classes: 'Meine Klassen',
        grading: 'Unterricht & Noten',
        'grades-overview': 'Notenübersicht',
        todos: 'To-do',
        settings: 'Einstellungen'
    };
    document.getElementById('view-title').textContent = viewTitles[viewName] || (viewName.charAt(0).toUpperCase() + viewName.slice(1));
    if (viewName === 'classes') renderClasses();
    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'grading') {
        populateGradeClassSelect();
        renderGrading();
    }
    if (viewName === 'grades-overview') renderGradesOverview();
    if (viewName === 'todos') renderTodos();
    if (viewName === 'settings') {
        loadTimeSlotsTable();
        try { renderODConfig(); } catch (e) {}
    }
    if (window.innerWidth <= 768) window.closeSidebar();
}

window.openSidebar = function() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('show');
    document.querySelector('.app-container').classList.remove('sidebar-collapsed');
};

window.closeSidebar = function() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    document.querySelector('.app-container').classList.add('sidebar-collapsed');
};

document.addEventListener('click', function(e) {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (!toggle || !sidebar) return;
    if (e.target === toggle) {
        if (sidebar.classList.contains('open')) window.closeSidebar();
        else window.openSidebar();
    }
});

function initSidebar() {
    window.closeSidebar();
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => {
            window.closeSidebar();
        });
    });
}

window.addEventListener('od-save-error', (e) => {
    setSyncStatus('Fehler: ' + (e.detail || 'OneDrive'));
    setTimeout(() => setODStatus(window.OD && window.OD.isConnected && window.OD.isConnected()), 2000);
});

function renderClasses() {
    const grid = document.getElementById('classes-grid');
    const classes = DB.getSortedClasses();
    const students = DB.getStudentsSorted();
    grid.innerHTML = '';
    const subjectOrder = { math: 'Mathematik', gz: 'Geometrisches Zeichnen', dg: 'Darstellende Geometrie', other: 'Andere Fächer' };
    let currentType = null;
    let currentList = null;
    classes.forEach(cls => {
        if (cls.type !== currentType) {
            currentType = cls.type;
            const group = document.createElement('div');
            group.className = 'class-group';
            group.innerHTML = '<h3>' + (subjectOrder[cls.type] || cls.subject || cls.type) + '</h3>';
            currentList = document.createElement('div');
            currentList.className = 'class-group-list';
            group.appendChild(currentList);
            grid.appendChild(group);
        }
        const count = students.filter(s => s.classId === cls.id).length;
        const card = document.createElement('div');
        card.className = 'class-card';
        card.style.borderTopColor = cls.color || 'var(--primary)';
        card.innerHTML = '<h3>' + cls.name + '</h3><p>' + cls.subject + '</p>' +
            '<p class="class-count">' + count + ' Schüler</p>';
        card.onclick = () => openClassManager(cls.id);
        currentList.appendChild(card);
    });
    populateGradeClassSelect();
}

function openClassManager(classId) {
    if (!classId) {
        showModal(getClassForm());
        return;
    }
    const cls = DB.loadClasses().find(c => c.id === classId);
    const students = DB.getStudentsForClass(classId);
    showModal(getClassManagerContent(cls, students));
}

function getClassForm() {
    return '<div class="modal-header">' +
        '<h2>Neuen Kurs anlegen</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<div class="form-group exam-form">' +
        '<input type="text" id="class-name-input" placeholder="Kursname (z.B. 7A Mathematik)">' +
        '<input type="text" id="class-subject-input" placeholder="Fach (z.B. Mathematik, Physik, ...)">' +
        '<label style="width:100%;font-size:13px;color:var(--text-muted);">Erster Unterrichtstag</label>' +
        '<input type="date" id="class-first-lesson-input" style="width:100%;padding:8px;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:8px;color:var(--text-color);">' +
        '<label style="width:100%;font-size:13px;color:var(--text-muted);">Unterrichtstage (für automatische Stundenplan-Erstellung)</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;width:100%;">' +
        ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag'].map(d => '<label class="lesson-day-label" style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--text-muted);cursor:pointer;width:auto;"><input type="checkbox" value="' + d + '" class="class-lesson-day" style="accent-color:var(--primary);"> ' + d + '</label>').join('') +
        '</div>' +
        '<label style="width:100%;font-size:13px;color:var(--text-muted);">Farbe</label>' +
        '<input type="color" id="class-color-input" value="#6366f1" style="width:100%;height:40px;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:8px;">' +
        '<button class="btn" onclick="createNewClass()">Erstellen</button>' +
        '</div>';
}

function getClassManagerContent(cls, students) {
    let studentList = '<ul class="student-list">';
    students.forEach(s => {
        studentList += '<li data-student-id="' + s.id + '" data-class-id="' + cls.id + '" onclick="selectStudent(this, \'' + s.id + '\', \'' + cls.id + '\')">' +
            studentAvatarHtml(s, 34) +
            '<span class="stu-name" id="stu-name-' + s.id + '">' + escapeHtml(s.name) + '</span>' +
            '<span class="stu-actions">' +
            '<input type="file" accept="image/*" style="display:none;" id="stu-photo-input-' + s.id + '" onchange="uploadStudentPhoto(this, \'' + s.id + '\', \'' + cls.id + '\')">' +
            '<button class="btn btn-secondary" title="Foto hinzufügen/ändern" onclick="document.getElementById(\'stu-photo-input-' + s.id + '\').click()">📷</button>' +
            '<button class="btn btn-secondary" title="Screenshot einfügen (Strg+V)" onclick="pasteStudentPhoto(\'' + s.id + '\', \'' + cls.id + '\')">📋</button>' +
            (s.photo ? '<button class="btn btn-secondary" title="Foto entfernen" onclick="removeStudentPhoto(\'' + s.id + '\', \'' + cls.id + '\')">🗑️</button>' : '') +
            '<button class="btn btn-secondary stu-edit" title="Name bearbeiten" onclick="editStudent(\'' + s.id + '\', \'' + cls.id + '\')">✎</button>' +
            '<button class="btn btn-secondary" title="Löschen" onclick="deleteStudent(\'' + s.id + '\', \'' + cls.id + '\')">×</button>' +
            '</span></li>';
    });
    studentList += '</ul>';
    studentList += '</ul>';
    if (students.length === 0) studentList = '<p>Keine Schüler vorhanden</p>';
    const clsColor = cls.color || '#6366f1';
    const studentCount = students.length;
    return '<div class="modal-header">' +
        '<h2>Kurs bearbeiten <span class="class-count" style="font-size:13px;margin-left:8px;">' + studentCount + ' Schüler</span></h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<div class="class-manager-body">' +
        '<div class="form-group exam-form">' +
        '<input type="text" id="edit-class-name-input" value="' + escapeHtml(cls.name) + '" placeholder="Kursname">' +
        '<input type="text" id="edit-class-subject-input" value="' + escapeHtml(cls.subject) + '" placeholder="Fach">' +
        '<label style="width:100%;font-size:13px;color:var(--text-muted);">Erster Unterrichtstag</label>' +
        '<input type="date" id="edit-class-first-lesson-input" value="' + (cls.firstLessonDate || '') + '" style="width:100%;padding:8px;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:8px;color:var(--text-color);">' +
        '<label style="width:100%;font-size:13px;color:var(--text-muted);">Unterrichtstage (für automatische Stundenplan-Erstellung)</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;width:100%;">' +
        ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag'].map(d => '<label class="lesson-day-label" style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--text-muted);cursor:pointer;width:auto;"><input type="checkbox" value="' + d + '" class="class-lesson-day" style="accent-color:var(--primary);" ' + ((cls.lessonDays && cls.lessonDays.indexOf(d) !== -1) ? 'checked' : '') + '> ' + d + '</label>').join('') +
        '</div>' +
        '<label style="width:100%;font-size:13px;color:var(--text-muted);">Kursfarbe</label>' +
        '<input type="color" id="edit-class-color-input" value="' + clsColor + '" style="width:100%;height:40px;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:8px;">' +
        '<label style="width:100%;font-size:13px;color:var(--text-muted);margin-top:8px;">Stundenplan-Modus</label>' +
        '<select id="edit-plan-mode" style="width:100%;padding:8px;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:8px;color:var(--text-color);">' +
        '<option value="mathe"' + ((cls.planMode || 'mathe') === 'mathe' ? ' selected' : '') + '>Mathe</option>' +
        '<option value="gz"' + ((cls.planMode || 'mathe') === 'gz' ? ' selected' : '') + '>GZ</option>' +
        '<option value="dg"' + ((cls.planMode || 'mathe') === 'dg' ? ' selected' : '') + '>DG</option>' +
        '<option value="other"' + ((cls.planMode || 'mathe') === 'other' ? ' selected' : '') + '>Allgemein</option>' +
        '</select>' +
        '<label style="display:flex;align-items:center;gap:8px;width:100%;font-size:13px;color:var(--text-muted);margin-top:8px;"><input type="checkbox" id="edit-show-exams" ' + (cls.showExams !== false ? 'checked' : '') + '> Schularbeiten anzeigen</label>' +
        '<label style="display:flex;align-items:center;gap:8px;width:100%;font-size:13px;color:var(--text-muted);margin-top:8px;"><input type="checkbox" id="edit-show-exercise-nr" ' + (cls.showExerciseNr !== false ? 'checked' : '') + '> SÜ-Nummern anzeigen</label>' +
        '<label style="display:flex;align-items:center;gap:8px;width:100%;font-size:13px;color:var(--text-muted);margin-top:8px;"><input type="checkbox" id="edit-show-homework" ' + (cls.showHomework !== false ? 'checked' : '') + '> Hausübungen anzeigen</label>' +
        '<button class="btn" onclick="saveClassDetails(\'' + cls.id + '\')">Speichern</button>' +
        '</div>' +
        '<div class="student-section">' +
        '<h3>Schüler <span class="class-count" style="font-size:13px;margin-left:8px;">' + studentCount + ' Schüler</span></h3>' + studentList +
        '</div>' +
        '<div class="form-group exam-form" style="margin-top:10px;">' +
        '<button class="btn btn-secondary" onclick="document.getElementById(\'csv-import-' + cls.id + '\').click()">Schüler importieren</button>' +
        '<input type="file" id="csv-import-' + cls.id + '" accept=".csv" style="display:none;" onchange="window.importStudentsFromCsv(this, \'' + cls.id + '\')">' +
        '</div>' +
        '<div class="class-manager-footer">' +
        '<div class="form-group exam-form">' +
        '<input type="text" id="new-student-input" placeholder="Schülername" onkeydown="if(event.key===\'Enter\') addStudentToClass(\'' + cls.id + '\')">' +
        '<button class="btn" onclick="addStudentToClass(\'' + cls.id + '\')">Hinzufügen</button>' +
        '</div>' +
        '<button class="btn btn-secondary" onclick="deleteClass(\'' + cls.id + '\')">Kurs löschen</button>' +
        '</div>' +
        '</div>';
}

function saveClassDetails(classId) {
    captureUndo();
    const name = document.getElementById('edit-class-name-input').value;
    const subject = document.getElementById('edit-class-subject-input').value;
    const color = document.getElementById('edit-class-color-input').value;
    const firstLessonEl = document.getElementById('edit-class-first-lesson-input');
    const firstLessonDate = firstLessonEl ? firstLessonEl.value : '';
    const classes = DB.loadClasses();
    const cls = classes.find(c => c.id === classId);
    if (cls && name) {
        cls.name = name;
        if (subject) cls.subject = subject;
        cls.color = color;
        if (firstLessonDate) cls.firstLessonDate = firstLessonDate;
        const dayChecks = document.querySelectorAll('.class-lesson-day:checked');
        cls.lessonDays = Array.from(dayChecks).map(cb => cb.value);
        if (!cls.lessonDays.length) {
            const typeDefaults = { gz: ['Montag'], dg: ['Dienstag'], math: ['Montag', 'Mittwoch', 'Freitag'], other: ['Dienstag'] };
            cls.lessonDays = typeDefaults[cls.type] || ['Montag'];
        }
        cls.planMode = document.getElementById('edit-plan-mode') ? document.getElementById('edit-plan-mode').value : (cls.planMode || 'mathe');
        cls.showExams = document.getElementById('edit-show-exams') ? document.getElementById('edit-show-exams').checked : (cls.showExams !== false);
        cls.showExerciseNr = document.getElementById('edit-show-exercise-nr') ? document.getElementById('edit-show-exercise-nr').checked : (cls.showExerciseNr !== false);
        cls.showHomework = document.getElementById('edit-show-homework') ? document.getElementById('edit-show-homework').checked : (cls.showHomework !== false);
        DB.saveClasses(classes);
    }
    hideModal();
    renderClasses();
    renderDashboard();
}

function createNewClass() {
    captureUndo();
    const name = document.getElementById('class-name-input').value;
    const subject = document.getElementById('class-subject-input').value;
    const color = document.getElementById('class-color-input').value;
    const firstLessonEl = document.getElementById('class-first-lesson-input');
    const firstLessonDate = firstLessonEl ? firstLessonEl.value : '';
    if (name && subject) {
        const type = subjectToType(subject);
        const dayChecks = document.querySelectorAll('#modal-content .class-lesson-day:checked');
        const lessonDays = Array.from(dayChecks).map(cb => cb.value);
        const typeDefaults = { gz: ['Montag'], dg: ['Dienstag'], math: ['Montag', 'Mittwoch', 'Freitag'] };
        const days = lessonDays.length ? lessonDays : (typeDefaults[type] || ['Montag']);
        DB.addClass(name, type, subject, color, firstLessonDate, days);
        hideModal();
        renderClasses();
    }
}

function subjectToType(subject) {
    const s = (subject || '').toLowerCase();
    if (s.indexOf('mathematik') !== -1) return 'math';
    if (s.indexOf('darstellende geometrie') !== -1 || s.indexOf('dg') !== -1) return 'dg';
    if (s.indexOf('geometrisches zeichnen') !== -1 || s.indexOf('gz') !== -1) return 'gz';
    return 'other';
}

function addStudentToClass(classId) {
    captureUndo();
    const name = document.getElementById('new-student-input').value.trim();
    if (name) {
        const parts = name.split(' ').filter(Boolean);
        const lastName = parts.length > 1 ? parts[0] : (parts[0] || name);
        DB.addStudent(classId, name, lastName);
        const cls = DB.loadClasses().find(c => c.id === classId);
        const students = DB.getStudentsForClass(classId);
        const content = getClassManagerContent(cls, students);
        showModal(content);
        setTimeout(function() {
            const list = document.querySelector('.student-list');
            if (list) list.scrollTop = list.scrollHeight;
            const input = document.getElementById('new-student-input');
            if (input) input.focus();
        }, 100);
    }
}

window.importStudentsFromCsv = function(input, classId) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const lines = e.target.result.split(/\r?\n/);
            let added = 0;
            const classes = DB.loadClasses();
            let headerSkipped = false;
            lines.forEach((line, index) => {
                const trimmed = line.trim();
                if (!trimmed) return;
                const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
                if (!headerSkipped && parts.length >= 2) {
                    const first = (parts[0] || '').toLowerCase();
                    const second = (parts[1] || '').toLowerCase();
                    if (first.indexOf('name') !== -1 || first.indexOf('vorname') !== -1 || first.indexOf('schüler') !== -1 || first.indexOf('schueler') !== -1 || second.indexOf('nachname') !== -1 || second.indexOf('klasse') !== -1) {
                        headerSkipped = true;
                        return;
                    }
                }
                if (parts.length === 0) return;
                let fullName = '';
                let lastName = '';
                let targetClassId = classId;
                if (parts.length >= 3) {
                    const vorname = parts[0] || '';
                    const nachname = parts[1] || '';
                    fullName = (vornname + ' ' + nachname).trim();
                    lastName = nachname;
                    if (parts[2]) {
                        const classIdOrName = parts[2];
                        const foundClass = classes.find(c => c.id === classIdOrName || c.name === classIdOrName);
                        if (foundClass) targetClassId = foundClass.id;
                    }
                } else if (parts.length >= 2) {
                    fullName = parts[0];
                    const nameParts = fullName.split(' ').filter(Boolean);
                    lastName = nameParts.length > 1 ? nameParts[0] : (nameParts[0] || fullName);
                    const classIdOrName = parts[1];
                    const foundClass = classes.find(c => c.id === classIdOrName || c.name === classIdOrName);
                    if (foundClass) targetClassId = foundClass.id;
                } else {
                    fullName = parts[0];
                    lastName = fullName;
                }
                if (fullName) {
                    DB.addStudent(targetClassId, fullName, lastName);
                    added++;
                }
            });
            input.value = '';
            const cls = DB.loadClasses().find(c => c.id === classId);
            const students = DB.getStudentsForClass(classId);
            showModal(getClassManagerContent(cls, students));
            if (added > 0) alert(added + ' Schüler importiert.');
            else alert('Keine Schüler gefunden.');
        } catch (err) {
            alert('CSV-Import fehlgeschlagen: ' + err.message);
        }
    };
    reader.readAsText(file);
};

function deleteStudent(id, classId) {
    if (!confirm('Schüler wirklich löschen?')) return;
    captureUndo();
    DB.deleteStudent(id);
    hideModal();
    const cls = DB.loadClasses().find(c => c.id === classId);
    const students = DB.getStudentsForClass(classId);
    showModal(getClassManagerContent(cls, students));
}

function editStudent(id, classId) {
    const span = document.getElementById('stu-name-' + id);
    if (!span) return;
    const current = span.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'stu-edit-' + id;
    input.className = 'stu-edit-input';
    input.value = current;
    span.replaceWith(input);
    input.focus();
    input.select();
    input.onkeydown = function(e) {
        if (e.key === 'Enter') saveStudentEdit(id, classId);
        else if (e.key === 'Escape') openClassManager(classId);
    };
}

function saveStudentEdit(id, classId) {
    const input = document.getElementById('stu-edit-' + id);
    if (!input) return;
    const name = input.value.trim();
    if (name) {
        const students = DB.getStudentsSorted();
        const stu = students.find(s => s.id === id);
        if (stu) { stu.name = name; DB.saveStudents(students); }
    }
    openClassManager(classId);
}

function deleteClass(id) {
    captureUndo();
    if (!confirm('Möchten Sie den Kurs wirklich löschen? Alle zugehörigen Daten (Schüler, Stundenplan, Noten) werden unwiderruflich entfernt.')) return;
    DB.deleteClass(id);
    hideModal();
    renderClasses();
}

let currentWeekStart = null;
let timetableViewMode = 'week';
let currentSelectedDate = null;
let timetableEditMode = false;

function getMonday(d) {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
}

function formatDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

function formatDateShort(d) {
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.';
}

function buildHolidayMap() {
    const map = {};
    (DB.loadHolidays() || []).forEach(h => { map[h.date] = h.localName || h.name; });
    (DB.loadAutonomousDays() || []).forEach(dt => { if (!map[dt]) map[dt] = 'Schulautonomer Tag'; });
    (DB.loadManualHolidays() || []).forEach(h => {
        if (h.from && h.to) {
            const d = new Date(h.from);
            const end = new Date(h.to);
            while (d <= end) {
                const key = formatDateKey(d);
                if (!map[key]) map[key] = h.name;
                d.setDate(d.getDate() + 1);
            }
        }
    });
    return map;
}

function addManualHoliday() {
    const name = document.getElementById('holiday-name').value.trim();
    const from = document.getElementById('holiday-from').value;
    const to = document.getElementById('holiday-to').value;
    if (!name) { alert('Bitte Bezeichnung eingeben.'); return; }
    if (!from || !to) { alert('Bitte Von- und Bis-Datum wählen.'); return; }
    if (to < from) { alert('Bis-Datum muss nach Von-Datum liegen.'); return; }
    DB.addManualHoliday(name, from, to);
    document.getElementById('holiday-name').value = '';
    document.getElementById('holiday-from').value = '';
    document.getElementById('holiday-to').value = '';
    renderHolidays();
    if (window.FilePersist) FilePersist.scheduleSave();
}

window.deleteManualHoliday = function(index) {
    if (!confirm('Eintrag löschen?')) return;
    captureUndo();
    DB.deleteManualHoliday(index);
    renderHolidays();
    if (window.FilePersist) FilePersist.scheduleSave();
};

window.setTimetableEditMode = function(active) {
    timetableEditMode = active;
    const btn = document.getElementById('open-timetable-btn');
    if (btn) {
        if (active) {
            btn.classList.add('btn-secondary');
            btn.textContent = 'Bearbeitung beenden';
        } else {
            btn.classList.remove('btn-secondary');
            btn.textContent = 'Stundenplan bearbeiten';
        }
    }
    renderDashboard();
};

window.toggleSettingsSection = function(header) {
    const section = header.closest('.settings-section');
    if (section) {
        section.classList.toggle('collapsed');
    }
};

const STEIERMARK_SCHOOL_HOLIDAYS = [
    { name: 'Herbstferien Steiermark', start: '2025-10-27', end: '2025-10-31' },
    { name: 'Weihnachtsferien Steiermark', start: '2025-12-24', end: '2026-01-06' },
    { name: 'Semesterferien Steiermark', start: '2026-02-16', end: '2026-02-21' },
    { name: 'Osterferien Steiermark', start: '2026-03-28', end: '2026-04-06' },
    { name: 'Pfingstferien Steiermark', start: '2026-05-23', end: '2026-05-25' },
    { name: 'Sommerferien Steiermark', start: '2026-07-11', end: '2026-09-13' },
    { name: 'Herbstferien Steiermark', start: '2026-10-26', end: '2026-10-30' },
    { name: 'Weihnachtsferien Steiermark', start: '2026-12-23', end: '2027-01-05' },
    { name: 'Semesterferien Steiermark', start: '2027-02-15', end: '2027-02-19' },
    { name: 'Osterferien Steiermark', start: '2027-03-29', end: '2027-04-07' },
    { name: 'Pfingstferien Steiermark', start: '2027-05-25', end: '2027-05-27' },
    { name: 'Sommerferien Steiermark', start: '2027-07-12', end: '2027-09-13' },
    { name: 'Herbstferien Steiermark', start: '2027-10-25', end: '2027-10-29' },
    { name: 'Weihnachtsferien Steiermark', start: '2027-12-22', end: '2028-01-04' },
    { name: 'Semesterferien Steiermark', start: '2028-02-20', end: '2028-02-25' },
    { name: 'Osterferien Steiermark', start: '2028-03-27', end: '2028-04-05' },
    { name: 'Pfingstferien Steiermark', start: '2028-05-22', end: '2028-05-24' },
    { name: 'Sommerferien Steiermark', start: '2028-07-10', end: '2028-09-12' }
];

function expandSchoolHolidays(list) {
    const out = [];
    list.forEach(range => {
        const d = new Date(range.start);
        const end = new Date(range.end);
        while (d <= end) {
            out.push([formatDateKey(d), range.name]);
            d.setDate(d.getDate() + 1);
        }
    });
    return out;
}

function goToToday() {
    currentWeekStart = getMonday(new Date());
    if (timetableViewMode === 'day') currentSelectedDate = new Date();
    renderDashboard();
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerHTML = (theme === 'light' ? '☀️' : '🌙') + '<span class="button-text"> Design</span>';
}

window.toggleTheme = function() {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    DB.save('theme', next);
};

function shiftWeek(delta) {
    if (!currentWeekStart) currentWeekStart = getMonday(new Date());
    currentWeekStart.setDate(currentWeekStart.getDate() + delta * 7);
    if (timetableViewMode === 'day' && currentSelectedDate) {
        currentSelectedDate = new Date(currentWeekStart);
        currentSelectedDate.setDate(currentSelectedDate.getDate() + (new Date().getDay() || 7) - 1);
    }
    renderDashboard();
}

function setTimetableViewMode(mode) {
    timetableViewMode = mode;
    renderDashboard();
}

function shiftDay(delta) {
    const base = currentSelectedDate || currentWeekStart || new Date();
    base.setDate(base.getDate() + delta);
    currentSelectedDate = base;
    renderDashboard();
}

function getSelectedDate() {
    if (timetableViewMode === 'day') {
        if (!currentSelectedDate) currentSelectedDate = new Date();
        return currentSelectedDate;
    }
    return currentWeekStart;
}

function getDaysForView() {
    if (timetableViewMode === 'day') {
        const d = getSelectedDate();
        return [d];
    }
    return daysOfWeek.map((_, i) => {
        const d = new Date(currentWeekStart);
        d.setDate(d.getDate() + i);
        return d;
    });
}

function renderDashboard() {
    if (!currentWeekStart) currentWeekStart = getMonday(new Date());
    populateTimetableCutoffSelect();
    const wrapper = document.getElementById('calendar-wrapper');
    const timetable = DB.getTimetable();
    const allSlots = DB.loadTimeSlots();
    const showFrueh = DB.loadShowFruehaufsicht();
    let timeSlots = allSlots.filter(s => showFrueh || s.name.toLowerCase().indexOf('frühaufsicht') === -1);
    const cutoffName = DB.loadTimetableCutoff();
    if (cutoffName) {
        const cutoffIndex = allSlots.findIndex(s => s.name === cutoffName);
        if (cutoffIndex >= 0) {
            timeSlots = timeSlots.filter(s => allSlots.indexOf(s) <= cutoffIndex);
        }
    }
    const endTime = DB.loadTimetableEndTime();
    if (endTime) {
        timeSlots = timeSlots.filter(s => !s.start || s.start < endTime);
    }
    const hideHolidays = DB.loadHideHolidayColumns();
    const classes = DB.loadClasses();
    const holidayMap = buildHolidayMap();
    const appointments = DB.loadAppointments();

    const viewDates = getDaysForView();
    const isDayView = timetableViewMode === 'day';

    let html = '<div class="tt-nav">' +
        '<button class="btn btn-secondary" onclick="' + (isDayView ? 'shiftDay(-1)' : 'shiftWeek(-1)') + '">‹ ' + (isDayView ? 'Voriger Tag' : 'Vorige Woche') + '</button>' +
        '<span class="tt-nav-label">' + formatDateShort(viewDates[0]) + (isDayView ? '' : ' – ' + formatDateShort(viewDates[viewDates.length - 1])) + '</span>' +
        '<button class="btn btn-secondary" onclick="' + (isDayView ? 'shiftDay(1)' : 'shiftWeek(1)') + '">' + (isDayView ? 'Nächster Tag' : 'Nächste Woche') + ' ›</button>' +
        '<button class="btn btn-secondary" onclick="setTimetableViewMode(\'week\')" ' + (!isDayView ? 'disabled' : '') + '>Woche</button>' +
        '<button class="btn btn-secondary" onclick="setTimetableViewMode(\'day\')" ' + (isDayView ? 'disabled' : '') + '>Tag</button>' +
        '<button class="btn" onclick="goToToday()">📍 Heute</button>' +
        '<button class="btn btn-secondary" onclick="window.openAppointmentModal()">📅 Termin</button>' +
        '</div>';

    html += '<div class="timetable-grid">';
    html += '<div class="tt-row tt-head"><div class="tt-time-col"></div>';
    viewDates.forEach((d, i) => {
        const key = formatDateKey(d);
        const isHol = holidayMap[key];
        const dayAppts = appointments.filter(a => a.date === key);
        const cls = 'tt-day-col' + (isHol ? ' tt-day-holiday' : '') + (dayAppts.length && !isHol ? ' tt-day-appointment' : '');
        const dayName = isDayView ? formatDateDE(d) : daysOfWeek[i];
        const abbr = isDayView ? formatDateShort(d) : dayName.substring(0, 2);
        if (isHol) {
            html += '<div class="' + cls + '">' + abbr + (isDayView ? '' : ' <small>' + formatDateShort(d) + '</small>') + ' <small style="font-weight:600;color:#d97706;">' + escapeHtml(isHol) + '</small></div>';
        } else {
            const apptHtml = dayAppts.length ? dayAppts.map(a => '<div style="text-align:left;font-size:11px;color:#fff;font-weight:400;">• ' + escapeHtml(a.title || 'Termin') + '</div>').join('') : '';
            html += '<div class="' + cls + '"' + (dayAppts.length ? ' title="' + escapeHtml(dayAppts.map(a => (a.description || a.title || 'Termin')).join(' | ')) + '"' : '') + '>' + abbr + (isDayView ? '' : ' <small>' + formatDateShort(d) + '</small>') + apptHtml + '</div>';
        }
    });
    html += '</div>';

    timeSlots.forEach(slot => {
        const firstWord = slot.name.split(' ')[0];
        const isPause = slot.name.toLowerCase().includes('pause');
        let timeCellHtml = '';
        if (!isPause) {
            const lessonMatch = slot.name.match(/^(\d+)\.\s*Stunde$/i);
            const lessonLabel = lessonMatch ? lessonMatch[1] + '. Stunde' : slot.name;
            timeCellHtml = slot.start + '<br>' + lessonLabel + '<br>' + slot.end;
        }
        html += '<div class="tt-row' + (isPause ? ' tt-pause-row' : '') + '"><div class="tt-time-col">' + timeCellHtml + '</div>';
        viewDates.forEach((d, i) => {
            const day = isDayView ? daysOfWeek[new Date(d).getDay() === 0 ? 6 : new Date(d).getDay() - 1] : daysOfWeek[i];
            const key = formatDateKey(d);
            const isHol = holidayMap[key];
            if (isHol && hideHolidays) {
                html += '<div class="tt-day-col tt-holiday"></div>';
            } else {
                const entry = timetable.find(e => e.day === day && (e.start === slot.start || e.period == firstWord));
                if (entry) {
                    const cls = classes.find(c => c.id === entry.classId);
                    const className = cls ? cls.name : '';
                    const isPatrol = entry.subject.toLowerCase() === 'gangaufsicht';
                    const isSprechstunde = entry.subject.toLowerCase() === 'sprechstunde';
                    const isBibliothek = entry.subject.toLowerCase() === 'bibliothek';
                    const entryClass = 'tt-day-col' + (isPause ? ' tt-pause-entry' : ' timetable-entry') + (isPatrol ? ' tt-patrol' : '') + (isSprechstunde || isBibliothek ? ' tt-sprechstunde' : '');
                    if (isPatrol) {
                        html += '<div class="' + entryClass + '" onclick="editTimetableEntry(\'' + entry.id + '\')" title="Aufsicht bearbeiten"><small>' + escapeHtml(entry.room || '') + '</small></div>';
                    } else if (isSprechstunde || isBibliothek) {
                        html += '<div class="' + entryClass + '" onclick="editTimetableEntry(\'' + entry.id + '\')" title="' + escapeHtml(entry.subject) + ' bearbeiten"><div><strong>' + escapeHtml(entry.subject === 'Sprechstunde' ? 'Sprstde' : 'Bibl') + '</strong></div><small>' + entry.room + '</small></div>';
                    } else {
                        const color = cls ? cls.color : null;
                        const styleAttr = color ? ' style="background-color:' + color + '66;border-left:8px solid ' + color + ';"' : '';
                        const abbr = subjectAbbr(entry.subject);
                        const clsLower = className.toLowerCase();
                        const redundant = abbr && (clsLower.indexOf(abbr.toLowerCase()) !== -1 || (entry.subject && clsLower.indexOf(entry.subject.toLowerCase()) !== -1));
                        const subjectHtml = (!className || !redundant) ? '<strong>' + (abbr || entry.subject) + '</strong>' : '';
                        const classLabel = className ? '<strong>' + className + '</strong>' + (subjectHtml ? ' · ' : '') : '';
                        html += '<div class="' + entryClass + '"' + styleAttr + ' onclick="openClassGrading(\'' + entry.classId + '\')" title="Notenverwaltung öffnen">' +
                            '<button class="tt-edit-btn" title="Stundenplan-Eintrag bearbeiten" onclick="event.stopPropagation();editTimetableEntry(\'' + entry.id + '\')">✎</button>' +
                            '<div>' + classLabel + subjectHtml + '</div><small>' + (entry.room || '') + '</small></div>';
                    }
                } else {
                    html += '<div class="tt-day-col timetable-free' + (timetableEditMode ? ' timetable-edit-mode' : '') + '"' + (timetableEditMode ? ' onclick="window.openTimetableEditorFromCell(\'' + day + '\', \'' + slot.start + '\')"' : '') + '></div>';
                }
            }
        });
        html += '</div>';
    });
    html += '</div>';
    wrapper.innerHTML = html;
}

function openTimetableEditor(preDay, prePeriod) {
    timetableEditMode = false;
    if (typeof setTimetableEditMode === 'function') setTimetableEditMode(false);
    const timetable = DB.getTimetable();
    const classes = DB.loadClasses();
    const timeSlots = DB.loadTimeSlots();
    const lessonSlots = timeSlots.filter(s => !s.name.toLowerCase().includes('pause'));
    let html = '<div class="modal-header">' +
        '<h2>Stundenplan bearbeiten</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>';
    html += '<div class="form-group exam-form">' +
        '<select id="tt-day">' + daysOfWeek.map(d => '<option value="' + d + '"' + (preDay && d === preDay ? ' selected' : '') + '>' + d + '</option>').join('') + '</select>' +
        '<select id="tt-period">' + timeSlots.map(s => '<option value="' + s.start + '"' + (prePeriod && s.start === prePeriod ? ' selected' : '') + '>' + s.name + ' (' + s.start + '–' + s.end + ')</option>').join('') + '</select>' +
        '<select id="tt-course">' +
        getClassesSortedByName().map(function(c) { return '<option value="' + c.id + '">' + c.name + ' – ' + classSubjectAbbr(c) + '</option>'; }).join('') +
        '<option value="Gangaufsicht">Gangaufsicht (Pause)</option>' +
        '<option value="Sprechstunde">Sprechstunde</option>' +
        '<option value="Bibliothek">Bibliothek</option>' +
        '</select>' +
        '<input type="text" id="tt-room" name="tt-room" placeholder="Raum/Bereich" autocomplete="off">' +
        '<button class="btn" onclick="addTimetableEntryModal()">Hinzufügen</button>' +
        '</div><hr><h3>Vorhandene Einträge</h3>';
    timetable.forEach(e => {
        const cls = classes.find(c => c.id === e.classId);
        const className = cls ? cls.name : '–';
        html += '<div style="padding:10px;margin:5px 0;background:var(--bg-dark);border-radius:8px;" oncontextmenu="if(event.target.tagName !== \'BUTTON\'){event.preventDefault();if(confirm(\'Eintrag löschen: ' + e.day + ' - ' + e.period + '?\'))deleteTimetableEntry(\'' + e.id + '\');}">' +
            e.day + ' - ' + e.period + ': ' + e.subject + ' (' + className + ', ' + e.room + ') ' +
            '<button class="btn btn-secondary" onclick="deleteTimetableEntry(\'' + e.id + '\')">×</button>' +
            '</div>';
    });
    showModal(html);
}

function addTimetableEntryModal() {
    const day = document.getElementById('tt-day').value;
    const period = document.getElementById('tt-period').value;
    const courseSel = document.getElementById('tt-course');
    const courseVal = courseSel.value;
    const room = document.getElementById('tt-room').value;
    let classId = '';
    let subject = '';
    if (courseVal === 'Gangaufsicht') {
        subject = 'Gangaufsicht';
    } else if (courseVal === 'Sprechstunde' || courseVal === 'Bibliothek') {
        subject = courseVal;
    } else {
        const cls = DB.loadClasses().find(c => c.id === courseVal);
        if (!cls) return;
        classId = cls.id;
        subject = cls.subject;
    }
    if (day && period && subject) {
        const timeSlots = DB.loadTimeSlots();
        const slot = timeSlots.find(s => s.start === period);
        DB.addTimetableEntry({ day: day, period: period, start: period, subject: subject, room: room, classId: classId });
        hideModal();
        renderDashboard();
    }
}

function deleteTimetableEntry(id) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    captureUndo();
    DB.deleteTimetableEntry(id);
    hideModal();
    renderDashboard();
}

function editTimetableEntry(id) {
    const entry = DB.getTimetable().find(e => e.id === id);
    const classes = DB.loadClasses();
    const isPatrol = entry.subject.toLowerCase() === 'gangaufsicht';
    const isSprechstunde = entry.subject.toLowerCase() === 'sprechstunde';
    const isBibliothek = entry.subject.toLowerCase() === 'bibliothek';
    const sortedClasses = getClassesSortedByName();
    const classOpts = sortedClasses.map(c => '<option value="' + c.id + '"' + (c.id === entry.classId ? ' selected' : '') + '>' + c.name + ' – ' + classSubjectAbbr(c) + '</option>').join('');
    let courseOptions = '<option value="Gangaufsicht">Gangaufsicht (Pause)</option><option value="Sprechstunde">Sprechstunde</option><option value="Bibliothek">Bibliothek</option>' + classOpts;
    if (isPatrol) courseOptions = '<option value="Gangaufsicht" selected>Gangaufsicht (Pause)</option><option value="Sprechstunde">Sprechstunde</option><option value="Bibliothek">Bibliothek</option>' + classOpts;
    if (isSprechstunde) courseOptions = '<option value="Gangaufsicht">Gangaufsicht (Pause)</option><option value="Sprechstunde" selected>Sprechstunde</option><option value="Bibliothek">Bibliothek</option>' + classOpts;
    if (isBibliothek) courseOptions = '<option value="Gangaufsicht">Gangaufsicht (Pause)</option><option value="Sprechstunde">Sprechstunde</option><option value="Bibliothek" selected>Bibliothek</option>' + classOpts;
    showModal('<div class="modal-header">' +
        '<h2>Eintrag bearbeiten</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<div class="form-group exam-form">' +
        '<select id="edit-course">' + courseOptions + '</select>' +
        '<input type="text" id="edit-room" value="' + entry.room + '">' +
        '<button class="btn" onclick="updateTimetableEntry(\'' + id + '\')">Speichern</button>' +
        '<button class="btn btn-secondary" onclick="deleteTimetableEntry(\'' + id + '\')">Löschen</button>' +
        '</div>');
}

function updateTimetableEntry(id) {
    captureUndo();
    const timetable = DB.getTimetable();
    const entry = timetable.find(e => e.id === id);
    const courseVal = document.getElementById('edit-course').value;
    const room = document.getElementById('edit-room').value;
    if (courseVal === 'Gangaufsicht') {
        entry.subject = 'Gangaufsicht';
        entry.classId = '';
    } else if (courseVal === 'Sprechstunde' || courseVal === 'Bibliothek') {
        entry.subject = courseVal;
        entry.classId = '';
    } else {
        const cls = DB.loadClasses().find(c => c.id === courseVal);
        if (cls) { entry.subject = cls.subject; entry.classId = cls.id; }
    }
    entry.room = room;
    DB.saveTimetable(timetable);
    hideModal();
    renderDashboard();
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getLastName(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0];
    return parts[0];
}

function studentInitials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function studentAvatarHtml(s, size) {
    const px = size || 28;
    if (s && s.photo) {
        return '<img class="stu-avatar stu-avatar-clickable" src="' + s.photo + '" alt="" style="width:' + px + 'px;height:' + px + 'px;" onclick="enlargeStudentPhoto(event, this)">';
    }
    return '<span class="stu-avatar stu-avatar-initials" style="width:' + px + 'px;height:' + px + 'px;font-size:' + Math.round(px * 0.42) + 'px;">' + escapeHtml(studentInitials(s ? s.name : '')) + '</span>';
}

window.enlargeStudentPhoto = function(event, img) {
    event.stopPropagation();
    event.preventDefault();
    const existing = document.getElementById('stu-photo-pop');
    if (existing) {
        const sameSrc = existing.getAttribute('data-src') === img.src;
        existing.remove();
        if (sameSrc) return; // Toggle: erneuter Klick schließt
    }
    const base = img.getBoundingClientRect();
    const size = Math.min(Math.max(base.width * 3, 90), 150);
    const pop = document.createElement('div');
    pop.id = 'stu-photo-pop';
    pop.setAttribute('data-src', img.src);
    pop.innerHTML = '<img src="' + img.src + '" style="width:' + size + 'px;height:' + size + 'px;">';
    document.body.appendChild(pop);
    let left = base.left + base.width + 8;
    let top = base.top + base.height / 2 - size / 2;
    if (left + size > window.innerWidth - 8) left = base.left - size - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (top + size > window.innerHeight - 8) top = window.innerHeight - size - 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    setTimeout(function() {
        document.addEventListener('click', function closePop() {
            const p = document.getElementById('stu-photo-pop');
            if (p) p.remove();
            document.removeEventListener('click', closePop);
        });
    }, 0);
};

function studentNameHtml(s) {
    return '<span class="stu-namecell">' + studentAvatarHtml(s, 28) + '<span>' + escapeHtml(s.name) + '</span></span>';
}

// Bild verkleinern (max. Kantenlänge) und als JPEG-DataURL zurückgeben, um Speicher zu sparen
function resizeImageFile(file, maxSize, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            let w = img.width, h = img.height;
            if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
            else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', 0.75));
        };
        img.onerror = function() { callback(null); };
        img.src = e.target.result;
    };
    reader.onerror = function() { callback(null); };
    reader.readAsDataURL(file);
}

window.uploadStudentPhoto = function(input, studentId, classId) {
    const file = input.files && input.files[0];
    if (!file) return;
    resizeImageFile(file, 160, function(dataUrl) {
        if (!dataUrl) { alert('Bild konnte nicht verarbeitet werden.'); return; }
        const students = DB.getStudentsSorted();
        const stu = students.find(s => s.id === studentId);
        if (stu) { stu.photo = dataUrl; DB.saveStudents(students); }
        openClassManager(classId);
    });
};

window.pasteStudentPhoto = function(studentId, classId) {
    if (!navigator.clipboard || !navigator.clipboard.read) {
        alert('Zwischenablage kann nicht gelesen werden. Bitte erneut versuchen oder Bild-Datei verwenden.');
        return;
    }
    navigator.clipboard.read().then(clipboardItems => {
        for (const item of clipboardItems) {
            for (const type of item.types) {
                if (type.startsWith('image/')) {
                    item.getType(type).then(blob => {
                        resizeImageFile(blob, 160, function(dataUrl) {
                            if (!dataUrl) { alert('Bild konnte nicht verarbeitet werden.'); return; }
                            const students = DB.getStudentsSorted();
                            const stu = students.find(s => s.id === studentId);
                            if (stu) { stu.photo = dataUrl; DB.saveStudents(students); }
                            openClassManager(classId);
                        });
                    });
                    return;
                }
            }
        }
        alert('Kein Bild in der Zwischenablage gefunden.');
    }).catch(err => {
        alert('Zugriff auf Zwischenablage fehlgeschlagen: ' + err.message);
    });
};

window.removeStudentPhoto = function(studentId, classId) {
    const students = DB.getStudentsSorted();
    const stu = students.find(s => s.id === studentId);
    if (stu) { delete stu.photo; DB.saveStudents(students); }
    openClassManager(classId);
};

window.selectStudent = function(el, studentId, classId) {
    document.querySelectorAll('.student-list li.selected').forEach(li => li.classList.remove('selected'));
    if (el) el.classList.add('selected');
    window._selectedStudentId = studentId;
    window._selectedClassId = classId;
};


window.printTimetable = function() {
    const wrapper = document.getElementById('calendar-wrapper');
    if (!wrapper) return;
    const weekLabel = wrapper.querySelector('.tt-nav-label');
    const grid = wrapper.querySelector('.timetable-grid');
    if (!grid) return;
    const title = weekLabel ? weekLabel.textContent.trim() : 'Stundenplan';

    const printHtml = '<div id="tt-controls" style="margin-bottom:15px;display:flex;gap:10px;align-items:center;">' +
        '<label>Breite: <input type="text" id="tt-width" value="100%" style="width:70px;padding:6px;border:1px solid #888;border-radius:4px;"></label>' +
        '<button id="tt-print-btn" style="padding:8px 16px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">🖨️ Drucken</button>' +
        '<span style="font-size:12px;color:#666;">Wert z. B. 10cm oder 100%</span>' +
        '</div>' +
        '<div id="tt-print-wrap" style="width:100%;overflow:auto;">' + grid.outerHTML + '</div>';

    const printStyles = [
        '@page { margin: 10mm; size: A4 landscape; }',
        'body { font-family: Inter, Arial, sans-serif; background: #fff !important; color: #000 !important; padding: 10px; margin: 0; }',
        '@media print { #tt-controls { display: none !important; } }',
        'h2 { font-size: 16px; margin-bottom: 8px; color: #000 !important; }',
        '#tt-print-wrap { width: 100%; }',
        '.timetable-grid { display: flex; flex-direction: column; gap: 1px; border: 1px solid #888; border-radius: 4px; overflow: hidden; background: #fff; }',
        '.tt-row { display: grid; grid-template-columns: 90px repeat(5, minmax(0, 1fr)); gap: 1px; }',
        '.tt-time-col { padding: 6px 4px; font-size: 11px; font-weight: 600; color: #222; background: #f4f4f4; border-radius: 2px; text-align: center; line-height: 1.2; }',
        '.tt-day-col { padding: 6px; border-radius: 2px; min-height: 48px; display: flex; flex-direction: column; justify-content: center; font-size: 12px; line-height: 1.25; }',
        '.tt-head .tt-day-col { font-weight: 700; text-transform: uppercase; font-size: 12px; color: #111; padding: 8px 6px; text-align: center; }',
        '.tt-head .tt-day-col small { display: inline; font-size: 12px; color: #333; }',
        '.timetable-entry { background: rgba(99, 102, 241, 0.15); border-left: 3px solid #6366f1; padding: 4px 6px; font-size: 12px; line-height: 1.25; }',
        '.timetable-entry strong { font-size: 12px; }',
        '.timetable-entry small { font-size: 11px; }',
        '.tt-edit-btn { display: none !important; }',
        '.tt-holiday { background: rgba(245, 158, 11, 0.18) !important; border: 1px solid #f59e0b; font-size: 12px; padding: 6px; text-align: center; }',
        '.timetable-free { background: #fafafa; border: 1px solid #eee; }',
        '.tt-pause-entry { background: #eee !important; border-left: 3px solid #94a3b8 !important; }',
        '.tt-pause-row .tt-day-col, .tt-pause-row .tt-time-col { min-height: 0; padding: 0 4px; font-size: 0; }',
        '.tt-holiday-row .tt-day-col { min-height: 0; padding: 0; background: transparent; border: none; }',
        '.tt-patrol, .tt-sprechstunde { background: #e2e8f0 !important; border-left: 3px solid #475569 !important; font-weight: 600 !important; color: #000 !important; min-height: 24px !important; padding: 3px 6px !important; font-size: 11px !important; }',
        '.tt-patrol strong, .tt-sprechstunde strong, .tt-patrol small, .tt-sprechstunde small { color: #000 !important; font-size: 11px !important; }',
        '.tt-row.tt-head .tt-day-col small { display: inline; font-size: 12px; color: #333; }'
    ].join('\n');

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stundenplan</title>' +
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">' +
        '<style>' + printStyles + '</style>' +
        '</head><body>' + printHtml +
        '<script>' +
        'document.getElementById("tt-width").addEventListener("input", function(e){' +
        '  var w = e.target.value || "100%";' +
        '  document.getElementById("tt-print-wrap").style.width = w;' +
        '});' +
        'document.getElementById("tt-print-btn").addEventListener("click", function(){ window.print(); });' +
        '</script>' +
        '</body></html>';

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'width=1200,height=800');
    if (win) {
        setTimeout(function() {
            const input = win.document.getElementById('tt-width');
            if (input) input.focus();
        }, 400);
    }
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
};

function formatDateDE(d) {
    if (!d) return '';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return d;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const date = new Date(year, month, day);
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const dayName = days[date.getDay()];
    return dayName + ' ' + m[3] + '.' + m[2] + '.' + m[1];
}

function formatDateShortDE(d) {
    if (!d) return '';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return d;
    return m[3] + '.' + m[2];
}

function populateTimetableCutoffSelect() {
    const select = document.getElementById('timetable-cutoff');
    if (!select) return;
    const slots = DB.loadTimeSlots();
    const current = DB.loadTimetableCutoff();
    const lessonSlots = slots.filter(s => s.name.toLowerCase().indexOf('stunde') !== -1 && s.name.toLowerCase().indexOf('pause') === -1);
    select.innerHTML = '<option value="">Alle Stunden</option>' +
        lessonSlots.map(s => '<option value="' + escapeHtml(s.name) + '"' + (current === s.name ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>').join('');
}

window.setTimetableCutoff = function(value) {
    DB.saveTimetableCutoff(value || '');
    renderDashboard();
};

function percentToGrade(p) {
    if (p == null || isNaN(p)) return null;
    const thresholds = DB.loadHwGradeThresholds();
    if (p >= (thresholds.g1 || 92)) return 1;
    if (p >= (thresholds.g2 || 79)) return 2;
    if (p >= (thresholds.g3 || 62)) return 3;
    if (p >= (thresholds.g4 || 50)) return 4;
    return 5;
}

function pointsToGrade(points, maxPoints, gradeScale) {
    if (points == null || isNaN(points) || !maxPoints) return null;
    if (!gradeScale || !gradeScale.length) return percentToGrade(points / maxPoints * 100);
    const hasValues = gradeScale.some(e => e.minPoints != null || e.maxPoints != null);
    if (!hasValues) return percentToGrade(points / maxPoints * 100);
    const sorted = gradeScale.slice().sort((a, b) => (b.minPoints || 0) - (a.minPoints || 0));
    for (const entry of sorted) {
        if ((entry.minPoints == null || points >= entry.minPoints) && (entry.maxPoints == null || points <= entry.maxPoints)) return entry.grade;
    }
    return 5;
}

function gradeClass(g) {
    if (g == 'A') return 'grade-absent';
    if (g == 5) return 'grade-5';
    if (g == 4) return 'grade-4';
    if (g == 1) return 'grade-1';
    return '';
}

function gradeSelect(value, onChange) {
    const opts = ['<option value="">–</option>'];
    [1,2,3,4,5].forEach(g => {
        opts.push('<option value="' + g + '"' + (value == g ? ' selected' : '') + '>' + g + '</option>');
    });
    return '<select class="grade-input" onchange="' + onChange + '">' + opts.join('') + '</select>';
}

function gradeSelectDecimal(value, onChange) {
    const opts = ['<option value="">–</option>'];
    for (let v = 1.00; v <= 5.00; v += 0.05) {
        const label = v.toFixed(2);
        opts.push('<option value="' + v + '"' + (parseFloat(value) == v ? ' selected' : '') + '>' + label + '</option>');
    }
    return '<select class="grade-input" onchange="' + onChange + '">' + opts.join('') + '</select>';
}

function classSubjectAbbr(cls) {
    if (!cls) return '';
    const map = { gz: 'GZ', dg: 'DG', math: 'Mathe' };
    if (cls.type && map[cls.type]) return map[cls.type];
    return cls.subject || '';
}

function getClassesSortedByName() {
    return DB.loadClasses().slice().sort(function(a, b) {
        const an = (a.name || '').toLowerCase();
        const bn = (b.name || '').toLowerCase();
        return an < bn ? -1 : (an > bn ? 1 : 0);
    });
}

function populateGradeClassSelect() {
    const select = document.getElementById('grade-class-select');
    const classes = getClassesSortedByName();
    select.innerHTML = '<option value="">Kurs auswählen...</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls.id;
        opt.textContent = cls.name + ' – ' + classSubjectAbbr(cls);
        select.appendChild(opt);
    });
    select.onchange = renderGrading;
}

let currentGradeTab = 'plan';
let hwScrollRestored = false;
let gradeOverviewScope = 'semester';
let currentExamId = null;
let examPointGrid = [];

function renderGrading() {
    const classId = document.getElementById('grade-class-select').value;
    const switcher = document.getElementById('grade-switcher');
    const container = document.getElementById('grading-table-container');
    if (!classId) {
        switcher.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    const prevWrap = document.querySelector('.hw-grid-wrap');
    const savedScrollLeft = prevWrap ? prevWrap.scrollLeft : 0;
    switcher.style.display = 'flex';
    const cls = DB.loadClasses().find(c => c.id === classId);
    const planMode = cls ? (cls.planMode || (cls.type === 'gz' ? 'gz' : (cls.type === 'dg' ? 'dg' : 'mathe'))) : 'mathe';
    const showExams = cls ? (cls.showExams !== false) : true;
    const showExerciseNr = cls ? (cls.showExerciseNr !== false) : true;
    const showHomework = cls ? (cls.showHomework !== false) : true;
    if (planMode === 'gz' && ((currentGradeTab === 'exam' || currentGradeTab === 'pruef') || (currentGradeTab === 'hw' && !showHomework))) {
        currentGradeTab = 'plan';
    }
    let tabs = [
        ['plan', 'Stundenplanung']
    ];
    if (showHomework) tabs.push(['hw', 'Hausübungen']);
    if (showExams || planMode === 'dg') tabs.push(['exam', 'Schularbeiten']);
    tabs.push(['pruef', 'Prüfungen']);
    tabs.push(['mit', 'Mitarbeit']);
    tabs.push(['overview', 'Übersicht']);
    if (planMode === 'dg') tabs.push(['project', 'Projekt']);
    if (planMode === 'gz') {
        const gzTabs = [
            ['plan', 'Stundenplanung']
        ];
        if (showHomework) gzTabs.push(['hw', 'Hausübungen']);
        gzTabs.push(['gz-grades', 'ÜB Noten']);
        gzTabs.push(['gz-project', 'Projekt']);
        gzTabs.push(['mit', 'Mitarbeit und Mappe']);
        gzTabs.push(['gz-forgotten', 'Vergessenes']);
        gzTabs.push(['worksheets', 'Liste der ÜB']);
        gzTabs.push(['gz-overview', 'Übersicht']);
        tabs = gzTabs;
    }
    switcher.innerHTML = tabs.map(t => '<button class="btn grade-tab ' + (currentGradeTab === t[0] ? 'active' : '') + '" onclick="setGradeTab(\'' + t[0] + '\')">' + t[1] + '</button>').join('');
    container.innerHTML = '<div class="grade-course-title">' + (cls ? escapeHtml(cls.name) : '') + (cls && cls.subject ? ' <span class="grade-course-subject">· ' + escapeHtml(cls.subject) + '</span>' : '') + '</div>' + renderGradeContent(classId);
    if (currentGradeTab === 'gz-grades' || currentGradeTab === 'hw') {
        if (hwScrollRestored && savedScrollLeft) {
            const wrapNow = document.querySelector('.hw-grid-wrap');
            if (wrapNow) wrapNow.scrollLeft = savedScrollLeft;
        }
        if (!hwScrollRestored) {
            setTimeout(() => {
                const wrap = document.querySelector('.hw-grid-wrap');
                const table = currentGradeTab === 'gz-grades' ? document.getElementById('gz-grades-table') : (wrap ? wrap.querySelector('table') : null);
                if (wrap && table) {
                    const firstDataRow = table.querySelector('tbody tr');
                    if (firstDataRow) {
                        const cells = firstDataRow.querySelectorAll('td');
                        if (currentGradeTab === 'gz-grades') {
                            const students = DB.getStudentsForClass(classId);
                            const worksheets = getGZPlannedWorksheets(classId);
                            if (students.length && worksheets.length) {
                                const targetCol = 1 + (worksheets.length - 1) * 4;
                                const targetCell = cells[targetCol];
                                if (targetCell) wrap.scrollLeft = targetCell.offsetLeft - 20;
                            }
                        } else {
                            const hws = (DB.loadTeachingPlan(classId) || []).filter(e => e.homeworkNr);
                            if (hws.length) {
                                const targetCol = 1 + (hws.length - 1);
                                const targetCell = cells[targetCol];
                                if (targetCell) wrap.scrollLeft = targetCell.offsetLeft - 20;
                            }
                        }
                        hwScrollRestored = true;
                    }
                }
            }, 50);
        }
    }
    attachGradeValidation(container);
}

function attachGradeValidation(container) {
    if (!container) return;
    container.querySelectorAll('.grade-input').forEach(inp => {
        if (inp.dataset.gvAttached) return;
        inp.dataset.gvAttached = '1';
        const validate = function() {
            if (!isValidGrade(inp.value)) inp.classList.add('invalid');
            else inp.classList.remove('invalid');
        };
        inp.addEventListener('input', validate);
        inp.addEventListener('change', validate);
        inp.addEventListener('blur', validate);
    });
}

function validateAllGrades() {
    let valid = true;
    document.querySelectorAll('.grade-input').forEach(inp => {
        if (!isValidGrade(inp.value)) {
            inp.classList.add('invalid');
            valid = false;
        } else {
            inp.classList.remove('invalid');
        }
    });
    return valid;
}

function setGradeTab(tab) {
    currentGradeTab = tab;
    hwScrollRestored = false;
    renderGrading();
}

function renderGradeContent(classId) {
    if (currentGradeTab === 'plan') return renderPlan(classId);
    if (currentGradeTab === 'hw') return renderHomework(classId);
    if (currentGradeTab === 'exam') return renderExamsView(classId);
    if (currentGradeTab === 'pruef') return renderPruefungen(classId);
    if (currentGradeTab === 'mit') return renderMitarbeit(classId);
    if (currentGradeTab === 'overview') return renderOverview(classId);
    if (currentGradeTab === 'project') return renderProjects(classId);
    if (currentGradeTab === 'worksheets') return renderGZWorksheets(classId);
    if (currentGradeTab === 'gz-grades') return renderGZGrades(classId);
    if (currentGradeTab === 'gz-project') return renderGZProject(classId);
    if (currentGradeTab === 'gz-forgotten') return renderGZForgotten(classId);
    if (currentGradeTab === 'gz-overview') return renderGZOverview(classId);
    return '';
}

/* ============ STUNDENPLANUNG ============ */
function sortedPlan(classId) {
    return DB.loadTeachingPlan(classId).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getCurrentSchoolYearDates() {
    const globalSettings = DB.loadGlobalSettings();
    return { start: globalSettings.schoolYearStart || '', end: globalSettings.schoolYearEnd || '' };
}

function filterPlanBySchoolYear(plan) {
    const { start, end } = getCurrentSchoolYearDates();
    if (!start || !end) return plan;
    return plan.filter(e => !e.date || (e.date >= start && e.date <= end));
}

function generateRegularDates(startDate, lessonDays, schoolYearEnd) {
    const regularDates = [];
    const dayOrder = { Montag: 1, Dienstag: 2, Mittwoch: 3, Donnerstag: 4, Freitag: 5 };
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(schoolYearEnd);
    end.setHours(23, 59, 59, 999);
    const d = new Date(start);
    while (d <= end) {
        const dayName = daysOfWeek[d.getDay() === 0 ? 6 : d.getDay() - 1];
        if (lessonDays.indexOf(dayName) !== -1) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            regularDates.push({ date: y + '-' + m + '-' + day, type: 'regular' });
        }
        d.setDate(d.getDate() + 1);
    }
    return regularDates;
}

function renderPlan(classId) {
    const plan = sortedPlan(classId);
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const cls = DB.loadClasses().find(c => c.id === classId);
    const planMode = cls ? (cls.planMode || (cls.type === 'gz' ? 'gz' : (cls.type === 'dg' ? 'dg' : 'mathe'))) : 'mathe';
    const showExerciseNr = cls ? (cls.showExerciseNr !== false) : true;
    const showHomework = cls ? (cls.showHomework !== false) : true;
    const isGZ = planMode === 'gz';
    const isDG = planMode === 'dg';
    const lessonDays = cls && cls.lessonDays && cls.lessonDays.length ? cls.lessonDays : (isGZ ? ['Montag'] : (isDG ? ['Dienstag'] : []));
    const hasAutoSchedule = lessonDays.length > 0;
    let html = '<div class="view-header"><div><h2>Stundenplanung</h2><p class="subtitle">Datum &amp; Nummern werden automatisch aus dem Stundenplan vorgeschlagen. Zeilenumbruch in den Inhalten wird übernommen.</p></div>' +
        '<button class="btn" onclick="openPlanModal(\'' + classId + '\')">+ Neue Stunde</button></div>';
    if (hasAutoSchedule) {
        const firstLessonDate = cls && cls.firstLessonDate ? cls.firstLessonDate : null;
        const globalSettings = DB.loadGlobalSettings();
        const schoolYearStart = globalSettings.schoolYearStart || '';
        const schoolYearEnd = globalSettings.schoolYearEnd || '';
        if (!schoolYearStart || !schoolYearEnd || !firstLessonDate) {
            html += '<p class="subtitle">Bitte Schuljahresbeginn und -ende in den Einstellungen festlegen und den ersten Unterrichtstag der Klasse eintragen.</p>';
            return html;
        }
        const supplierDates = plan.filter(e => e.supplier && e.date).map(e => e.date);
        const supplierEntries = plan.filter(e => e.supplier && e.date);
        const regularDates = generateRegularDates(firstLessonDate, lessonDays, schoolYearEnd);
        const allDates = regularDates.concat(supplierDates.map(date => ({ date: date, type: 'supplier' })));
        allDates.sort((a, b) => a.date.localeCompare(b.date));

        if (isGZ) {
            html += '<table class="grading-table plan-table plan-table-gz"><thead><tr><th>Datum</th><th>Übungsblatt</th><th>Inhalt</th><th></th></tr></thead><tbody>';
            allDates.forEach(item => {
                const date = item.date;
                const isToday = date === todayStr;
                const isSupplier = item.type === 'supplier';
                const holiday = isHoliday(date);
                const entry = isSupplier ?
                    supplierEntries.find(e => e.date === date) :
                    plan.find(e => e.date === date && !e.supplier);
                const nr = entry ? entry.homeworkNr : '';
                const title = entry ? (entry.homeworkContent || '') : '';
                const typeLabel = holiday ? '<span class="holiday-marker">Ferien</span>' : (isSupplier ? '<span class="supplier-marker">Supplierung</span>' : '');
                const rowClass = (holiday ? 'holiday-row ' : '') + (isToday ? 'plan-today' : '');
                const actions = entry ?
                    '<button class="btn btn-secondary" onclick="openPlanModal(\'' + classId + '\',\'' + entry.id + '\')">✎</button> <button class="btn btn-secondary" onclick="deletePlanEntry(\'' + classId + '\',\'' + entry.id + '\')">×</button>' :
                    '<button class="btn btn-secondary" onclick="openPlanModal(\'' + classId + '\', null, \'' + date + '\')">+</button>';
                const contentClass = nr ? 'pre plan-content-gz' : 'pre plan-content-gz plan-content-only';
                html += '<tr class="' + rowClass.trim() + '">' +
                    '<td>' + formatDateDE(date) + (typeLabel ? '<br><small>' + typeLabel + '</small>' : '') + '</td>' +
                    '<td>' + (nr ? (nr + '<span style="margin-left:20px;">' + escapeHtml(title) + '</span>') : '–') + '</td>' +
                    '<td class="' + contentClass + '">' + (entry ? escapeHtml(entry.exerciseContent || '') : '') + '</td>' +
                    '<td class="row-actions">' + actions + '</td>' +
                    '</tr>';
            });
        } else if (isDG) {
            html += '<table class="grading-table plan-table plan-table-dg"><thead><tr><th>Datum</th><th>Inhalt Schulübung</th><th>HÜ</th><th></th></tr></thead><tbody>';
            allDates.forEach(item => {
                const date = item.date;
                const isToday = date === todayStr;
                const isFuture = date > todayStr;
                const isSupplier = item.type === 'supplier';
                const holiday = isHoliday(date);
                const entry = isSupplier ?
                    supplierEntries.find(e => e.date === date) :
                    plan.find(e => e.date === date && !e.supplier);
                const hwNr = entry ? (entry.homeworkNr || '') : '';
                const sheetsText = (entry ? (entry.homeworkSheets || '') : '').trim();
                const hwDisplay = sheetsText ? (hwNr + '<small style="margin-left:20px;">' + escapeHtml(sheetsText) + '</small>') : (hwNr || '–');
                const rowClass = (holiday ? 'holiday-row ' : '') + (isToday ? 'plan-today' : '') + (isFuture ? ' plan-future' : '');
                const typeLabel = holiday ? '<span class="holiday-marker">Ferien</span>' : (isSupplier ? '<span class="supplier-marker">Supplierung</span>' : '');
                html += '<tr class="' + rowClass.trim() + '">' +
                    '<td>' + formatDateDE(date) + (typeLabel ? '<br><small>' + typeLabel + '</small>' : '') + '</td>' +
                    '<td class="pre">' + escapeHtml(entry ? (entry.exerciseContent || '') : '') + '</td>' +
                    '<td>' + hwDisplay + '</td>' +
                    '<td class="row-actions"><button class="btn btn-secondary" onclick="openPlanModal(\'' + classId + '\',\'' + (entry ? entry.id : '') + '\', \'' + date + '\')">✎</button> ' + (entry ? '<button class="btn btn-secondary" onclick="deletePlanEntry(\'' + classId + '\',\'' + entry.id + '\')">×</button>' : '') + '</td>' +
                    '</tr>';
            });
        } else {
            const cols = ['Datum'];
            if (showExerciseNr) cols.push('SÜ-Nr.');
            cols.push('Inhalt Schulübung');
            if (showHomework) cols.push('HÜ');
            cols.push('Inhalt Hausübung');
            cols.push('');
        const tableClass = planMode === 'other' ? 'grading-table plan-table plan-table-other' : 'grading-table plan-table';
        html += '<table class="' + tableClass + '"><thead><tr>' + cols.map(c => '<th' + (c === 'Inhalt Schulübung' ? ' class="plan-content-other"' : '') + (c === 'HÜ' ? ' class="plan-hw-other"' : '') + (c === 'Inhalt Hausübung' ? ' class="plan-hw-content-other"' : '') + '>' + c + '</th>').join('') + '</tr></thead><tbody>';
            allDates.forEach(item => {
                const date = item.date;
                const isToday = date === todayStr;
                const isFuture = date > todayStr;
                const isSupplier = item.type === 'supplier';
                const holiday = isHoliday(date);
                const entry = isSupplier ?
                    supplierEntries.find(e => e.date === date) :
                    plan.find(e => e.date === date && !e.supplier);
                const typeLabel = holiday ? '<span class="holiday-marker">Ferien</span>' : (isSupplier ? '<span class="supplier-marker">Supplierung</span>' : '');
                const rowClass = (holiday ? 'holiday-row ' : '') + (isToday ? 'plan-today' : '') + (isFuture ? ' plan-future' : '');
                let cells = '<td>' + formatDateDE(date) + (typeLabel ? '<br><small>' + typeLabel + '</small>' : '') + '</td>';
                if (showExerciseNr) cells += '<td>' + (entry ? (entry.exerciseNr || '–') : '–') + '</td>';
                cells += '<td class="pre plan-content-other">' + escapeHtml(entry ? (entry.exerciseContent || '') : '') + '</td>';
                if (showHomework) cells += '<td class="plan-hw-other">' + (entry ? (entry.homeworkNr || '–') : '–') + '</td>';
                cells += '<td class="pre plan-hw-content-other">' + escapeHtml(entry ? (entry.homeworkContent || '') : '') + '</td>';
                cells += '<td class="row-actions"><button class="btn btn-secondary" onclick="openPlanModal(\'' + classId + '\',\'' + (entry ? entry.id : '') + '\', \'' + date + '\')">✎</button> ' + (entry ? '<button class="btn btn-secondary" onclick="deletePlanEntry(\'' + classId + '\',\'' + entry.id + '\')">×</button>' : '') + '</td>';
                html += '<tr class="' + rowClass.trim() + '">' + cells + '</tr>';
            });
        }
        html += '</tbody></table>';
        setTimeout(function() {
            const todayRow = document.querySelector('.plan-today');
            if (todayRow) {
                todayRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 0);
        return html;
    }
    if (!plan.length) {
        html += '<p class="subtitle">Noch keine Einträge. Lege die erste Stunde an.</p>';
        return html;
    }
    if (isGZ) {
        html += '<table class="grading-table plan-table"><thead><tr><th>Datum</th><th>Übungsblatt</th><th>Inhalt</th><th></th></tr></thead><tbody>';
        plan.forEach(e => {
            const isToday = e.date === todayStr;
            const isFuture = e.date > todayStr;
            const holiday = isHoliday(e.date);
            const typeLabel = holiday ? '<span class="holiday-marker">Ferien</span>' : (e.supplier ? '<span class="supplier-marker">Supplierung</span>' : '');
            const nr = e.homeworkNr ? e.homeworkNr : '';
            const title = e.homeworkContent || '';
            const rowClass = (holiday ? 'holiday-row ' : '') + (isToday ? 'plan-today' : '') + (isFuture ? ' plan-future' : '');
            html += '<tr class="' + rowClass.trim() + '">' +
                '<td>' + formatDateDE(e.date) + (typeLabel ? '<br><small>' + typeLabel + '</small>' : '') + '</td>' +
                '<td>' + (nr ? (nr + '<span style="margin-left:20px;">' + escapeHtml(title) + '</span>') : '–') + '</td>' +
                '<td class="pre">' + escapeHtml(e.exerciseContent || '') + '</td>' +
                '<td class="row-actions"><button class="btn btn-secondary" onclick="openPlanModal(\'' + classId + '\',\'' + e.id + '\')">✎</button> <button class="btn btn-secondary" onclick="deletePlanEntry(\'' + classId + '\',\'' + e.id + '\')">×</button></td>' +
                '</tr>';
        });
        html += '</tbody></table>';
        setTimeout(function() {
            const todayRow = document.querySelector('.plan-today');
            if (todayRow) {
                todayRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 0);
    } else if (isDG) {
        html += '<table class="grading-table plan-table"><thead><tr><th>Datum</th><th>Inhalt Schulübung</th><th>HÜ</th><th></th></tr></thead><tbody>';
        plan.forEach(e => {
            const isToday = e.date === todayStr;
            const isFuture = e.date > todayStr;
            const holiday = isHoliday(e.date);
            const typeLabel = holiday ? '<span class="holiday-marker">Ferien</span>' : (e.supplier ? '<span class="supplier-marker">Supplierung</span>' : '');
            const hwNr = e.homeworkNr ? e.homeworkNr : '–';
            const sheetsText = (e.homeworkSheets || '').trim();
            const hwDisplay = sheetsText ? (hwNr + '<small style="margin-left:20px;">' + escapeHtml(sheetsText) + '</small>') : hwNr;
            const rowClass = (holiday ? 'holiday-row ' : '') + (isToday ? 'plan-today' : '') + (isFuture ? ' plan-future' : '');
            html += '<tr class="' + rowClass.trim() + '">' +
                '<td>' + formatDateDE(e.date) + (typeLabel ? '<br><small>' + typeLabel + '</small>' : '') + '</td>' +
                '<td class="pre">' + escapeHtml(e.exerciseContent || '') + '</td>' +
                '<td>' + hwDisplay + '</td>' +
                '<td class="row-actions"><button class="btn btn-secondary" onclick="openPlanModal(\'' + classId + '\',\'' + e.id + '\')">✎</button> <button class="btn btn-secondary" onclick="deletePlanEntry(\'' + classId + '\',\'' + e.id + '\')">×</button></td>' +
                '</tr>';
        });
        html += '</tbody></table>';
        setTimeout(function() {
            const todayRow = document.querySelector('.plan-today');
            if (todayRow) {
                todayRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 0);
    } else {
        const cols = ['Datum'];
        if (showExerciseNr) cols.push('SÜ-Nr.');
        cols.push('Inhalt Schulübung');
        if (showHomework) cols.push('HÜ');
        cols.push('Inhalt Hausübung');
        cols.push('');
        const tableClass = planMode === 'other' ? 'grading-table plan-table plan-table-other' : 'grading-table plan-table';
        html += '<table class="' + tableClass + '"><thead><tr>' + cols.map(c => '<th' + (c === 'Inhalt Schulübung' ? ' class="plan-content-other"' : '') + (c === 'HÜ' ? ' class="plan-hw-other"' : '') + (c === 'Inhalt Hausübung' ? ' class="plan-hw-content-other"' : '') + '>' + c + '</th>').join('') + '</tr></thead><tbody>';
        plan.forEach(e => {
            const isToday = e.date === todayStr;
            const isFuture = e.date > todayStr;
            const holiday = isHoliday(e.date);
            const typeLabel = holiday ? '<span class="holiday-marker">Ferien</span>' : (e.supplier ? '<span class="supplier-marker">Supplierung</span>' : '');
            const rowClass = (holiday ? 'holiday-row ' : '') + (isToday ? 'plan-today' : '') + (isFuture ? ' plan-future' : '');
            let cells = '<td>' + formatDateDE(e.date) + (typeLabel ? '<br><small>' + typeLabel + '</small>' : '') + '</td>';
            if (showExerciseNr) cells += '<td>' + (e.exerciseNr ? e.exerciseNr : '–') + '</td>';
            cells += '<td class="pre plan-content-other">' + escapeHtml(e.exerciseContent || '') + '</td>';
            if (showHomework) cells += '<td class="plan-hw-other">' + (e.homeworkNr ? e.homeworkNr : '–') + '</td>';
            cells += '<td class="pre plan-hw-content-other">' + escapeHtml(e.homeworkContent || '') + '</td>';
            cells += '<td class="row-actions"><button class="btn btn-secondary" onclick="openPlanModal(\'' + classId + '\',\'' + e.id + '\')">✎</button> <button class="btn btn-secondary" onclick="deletePlanEntry(\'' + classId + '\',\'' + e.id + '\')">×</button></td>';
            html += '<tr class="' + rowClass.trim() + '">' + cells + '</tr>';
        });
        html += '</tbody></table>';
        setTimeout(function() {
            const todayRow = document.querySelector('.plan-today');
            if (todayRow) {
                todayRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 0);
    }
    return html;
}

function openPlanModal(classId, id, date) {
    const plan = sortedPlan(classId);
    let e = null;
    if (id) e = DB.loadTeachingPlan(classId).find(p => p.id === id);
    const cls = DB.loadClasses().find(c => c.id === classId);
    const nextEx = plan.filter(x => x.exerciseNr).length + 1;
    const nextHw = plan.filter(x => x.homeworkNr).length + 1;
    const lastDate = plan.length ? plan[plan.length - 1].date : null;
    const defDate = e ? e.date : (date || (DB.nextLessonDate(classId, lastDate) || ''));
    const exNr = e ? e.exerciseNr : nextEx;
    const hwNr = e ? e.homeworkNr : nextHw;
    const hwSheets = e ? (e.homeworkSheets || '') : '';
    const isSupplier = e ? e.supplier : false;
    const isDG = isDGClass(classId);
    const isGZ = isGZClass(classId);
    const showExerciseNr = cls ? cls.showExerciseNr !== false : true;
    const showHomework = cls ? cls.showHomework !== false : true;
    let exNrHtml = '';
    if (!isDG && !isGZ && showExerciseNr) {
        exNrHtml = '<label>Nummer Schulübung</label><input type="number" id="plan-exnr" value="' + (exNr || '') + '">';
    }
    const exContentHtml = '<label>Inhalt</label><textarea id="plan-excontent" rows="4" style="white-space:pre-wrap;">' + escapeHtml(e ? e.exerciseContent : '') + '</textarea>';
    let wsHtml = '';
    if (isGZ) {
        const wsNr = e ? (e.homeworkNr || '') : '';
        const wsTitle = e ? (e.homeworkContent || '') : '';
        wsHtml = '<label>Übungsblatt-Nummer</label><input type="number" id="plan-wsnr" value="' + (wsNr || '') + '">' +
            '<label>Übungsblatt-Titel</label><input type="text" id="plan-wstitle" value="' + escapeHtml(wsTitle) + '" placeholder="Titel des Übungsblattes">';
    }
    let hwNrHtml = '';
    let hwContentHtml = '';
    if (isDG && showHomework) {
        hwNrHtml = '<label>HÜ-Blätter (kommagetrennt, z.B. Blatt 1, Blatt 2)</label><input type="text" id="plan-hwsheets" value="' + escapeHtml(hwSheets) + '" placeholder="Blatt 1, Blatt 2">';
    } else if (!isGZ && showHomework) {
        hwNrHtml = '<label>Nummer Hausübung</label><input type="number" id="plan-hwnr" value="' + (hwNr || '') + '">';
        hwContentHtml = '<label>Inhalt Hausübung</label><textarea id="plan-hwcontent" rows="4" style="white-space:pre-wrap;">' + escapeHtml(e ? e.homeworkContent : '') + '</textarea>';
    }
    const supplierHtml = '<button type="button" id="plan-supplier" class="btn" data-supplier="0" onclick="window.toggleSupplier(this)" style="width:100%;margin-top:4px;">Supplierstunde</button>';
    showModal(
        '<div class="modal-header"><h2>' + (id ? 'Stunde bearbeiten' : 'Neue Stunde') + '</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<div class="form-group exam-form">' +
        '<label>Datum der Stunde</label><input type="date" id="plan-date" value="' + escapeHtml(defDate) + '">' +
        exNrHtml +
        wsHtml +
        (isGZ ? exContentHtml : '') +
        (!isGZ ? exContentHtml : '') +
        hwNrHtml +
        hwContentHtml +
        supplierHtml +
        '<button class="btn" onclick="savePlanEntry(\'' + classId + '\',\'' + (id || '') + '\')">Speichern</button>' +
        '</div>'
    );
}

function savePlanEntry(classId, id) {
    captureUndo();
    const date = document.getElementById('plan-date').value;
    if (!date) { alert('Bitte Datum angeben'); return; }
    const isDG = isDGClass(classId);
    const isGZ = isGZClass(classId);
    let exNr = '', exContent = '';
    if (!isDG && !isGZ) {
        const exNrEl = document.getElementById('plan-exnr');
        exNr = exNrEl ? exNrEl.value : '';
    }
    const exContentEl = document.getElementById('plan-excontent');
    exContent = exContentEl ? exContentEl.value : '';
    const wsNrEl = document.getElementById('plan-wsnr');
    const wsTitleEl = document.getElementById('plan-wstitle');
    const wsNr = (isGZ && wsNrEl) ? wsNrEl.value : '';
    const wsTitle = (isGZ && wsTitleEl) ? wsTitleEl.value : '';
    const hwSheetsEl = document.getElementById('plan-hwsheets');
    const hwSheets = hwSheetsEl ? hwSheetsEl.value.trim() : '';
    let hwNr = '';
    if (isDG) {
        const plan = DB.loadTeachingPlan(classId);
        hwNr = plan.filter(x => x.homeworkNr).length + 1;
    } else if (isGZ) {
        hwNr = wsNr;
    } else {
        const hwNrEl = document.getElementById('plan-hwnr');
        hwNr = hwNrEl ? hwNrEl.value : '';
    }
    const hwContent = isDG ? '' : (isGZ ? wsTitle : (document.getElementById('plan-hwcontent') ? document.getElementById('plan-hwcontent').value : ''));
    const supplierEl = document.getElementById('plan-supplier');
    const supplier = supplierEl ? supplierEl.getAttribute('data-supplier') === '1' : false;
    const fields = {
        date: date,
        exerciseNr: exNr ? parseInt(exNr) : '',
        exerciseContent: exContent,
        homeworkNr: (isGZ ? wsNr : hwNr) ? parseInt(isGZ ? wsNr : hwNr) : '',
        homeworkContent: hwContent,
        homeworkSheets: hwSheets,
        supplier: supplier
    };
    if (id) DB.updateTeachingPlanEntry(classId, id, fields);
    else DB.addTeachingPlanEntry(classId, date, fields.exerciseNr, exContent, fields.homeworkNr, hwContent, hwSheets, supplier);
    hideModal();
    renderGrading();
}

function deletePlanEntry(classId, id) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    captureUndo();
    DB.deleteTeachingPlanEntry(classId, id);
    renderGrading();
}

window.openSupplierModal = function(classId, date) {
    const plan = sortedPlan(classId);
    const nextEx = plan.filter(x => x.exerciseNr).length + 1;
    const nextHw = plan.filter(x => x.homeworkNr).length + 1;
    const defDate = date || '';
    const exNr = nextEx;
    const hwNr = nextHw;
    const isGZ = isGZClass(classId);
    let exNrHtml = '';
    if (!isGZ) {
        exNrHtml = '<label>Nummer Schulübung</label><input type="number" id="plan-exnr" value="' + (exNr || '') + '">';
    }
    const exContentHtml = '<label>Inhalt</label><textarea id="plan-excontent" rows="4" style="white-space:pre-wrap;"></textarea>';
    let wsHtml = '';
    if (isGZ) {
        wsHtml = '<label>Übungsblatt-Nummer</label><input type="number" id="plan-wsnr" value="' + (hwNr || '') + '">' +
            '<label>Übungsblatt-Titel</label><input type="text" id="plan-wstitle" placeholder="Titel des Übungsblattes">';
    }
    const supplierHtml = '<button type="button" id="plan-supplier" class="btn" data-supplier="1" onclick="window.toggleSupplier(this)" style="width:100%;margin-top:4px;">Supplierstunde (aktiv)</button>';
    showModal(
        '<div class="modal-header"><h2>Supplierstunde hinzufügen</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<div class="form-group exam-form">' +
        '<label>Datum der Stunde</label><input type="date" id="plan-date" value="' + escapeHtml(defDate) + '">' +
        exNrHtml +
        wsHtml +
        (isGZ ? exContentHtml : '') +
        (!isGZ ? exContentHtml : '') +
        supplierHtml +
        '<button class="btn" onclick="saveSupplierEntry(\'' + classId + '\')">Speichern</button>' +
        '</div>'
    );
};

window.saveSupplierEntry = function(classId) {
    const date = document.getElementById('plan-date').value;
    if (!date) { alert('Bitte Datum angeben'); return; }
    const isGZ = isGZClass(classId);
    let exNr = '', exContent = '';
    if (!isGZ) {
        const exNrEl = document.getElementById('plan-exnr');
        exNr = exNrEl ? exNrEl.value : '';
    }
    const exContentEl = document.getElementById('plan-excontent');
    exContent = exContentEl ? exContentEl.value : '';
    const wsNrEl = document.getElementById('plan-wsnr');
    const wsNr = (isGZ && wsNrEl) ? wsNrEl.value : '';
    const wsTitleEl = document.getElementById('plan-wstitle');
    const wsTitle = (isGZ && wsTitleEl) ? wsTitleEl.value : '';
    let hwNr = '';
    if (isGZ) {
        hwNr = wsNr;
    }
    const hwContent = isGZ ? wsTitle : exContent;
    const fields = {
        date: date,
        exerciseNr: exNr ? parseInt(exNr) : '',
        exerciseContent: exContent,
        homeworkNr: hwNr ? parseInt(hwNr) : '',
        homeworkContent: hwContent,
        homeworkSheets: '',
        supplier: true
    };
    DB.addTeachingPlanEntry(classId, date, fields.exerciseNr, exContent, fields.homeworkNr, hwContent, '', true);
    hideModal();
    renderGrading();
};

/* ============ HAUSÜBUNGEN ============ */
function hwStatusOptions(sel, classId) {
    if (isDGClass(classId)) {
        const opts = [['', '–', ''], ['4', '4', ''], ['3', '3', ''], ['2', '2', ''], ['1', '1', ''], ['0', '0', 'hw-opt-0'], ['k', 'k', 'hw-opt-k']];
        return opts.map(o => '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + (o[2] ? ' class="' + o[2] + '"' : '') + '>' + o[1] + '</option>').join('');
    }
    const opts = [['', '–'], ['forgotten', 'x'], ['improve', 'V!'], ['improved', 'Vg'], ['sick', 'k'], ['collected', 'ab']];
    return opts.map(o => '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + ' class="hw-opt-' + o[0] + '">' + o[1] + '</option>').join('');
}

function computeHwGrade(classId, studentId, hws) {
    const isDG = isDGClass(classId);
    const status = DB.loadHwStatus(classId);
    const corrected = DB.loadHwCorrected(classId);
    const st = status[studentId] || {};
    let points = 0, total = 0, missing = 0;
    const missingNrs = [];
    hws.forEach(h => {
        if (isDG) {
            const sheets = (h.sheets || '').split(',').map(s => s.trim()).filter(Boolean);
            const cell = st[h.nr] || {};
            sheets.forEach(name => {
                const val = cell.status && typeof cell.status === 'object' ? (cell.status[name] || '') : '';
                if (val === 'k') return;
                total += 4;
                if (val === '4' || val === '3' || val === '2' || val === '1') points += parseInt(val, 10);
                else if (val === '0' || val === '') { missing += 1; missingNrs.push(h.nr + '/' + name); }
            });
        } else {
            const cell = st[h.nr];
            const s = cell ? cell.status : '';
            if (s === 'sick') return;
            total += 1;
            if (s === 'done' || s === 'improved' || s === 'collected') points += 1;
            else if (s === 'improve') points += 0.5;
            else if (s === '') {
                if (corrected[h.nr]) points += 1;
                else { missing += 1; missingNrs.push(h.nr); }
            } else if (s === 'forgotten') { missing += 1; missingNrs.push(h.nr); }
        }
    });
    if (total === 0) return { grade: null, missing: 0, points: 0, total: 0, missingNrs: [] };
    return { grade: percentToGrade(points / total * 100), missing: missing, points: points, total: total, missingNrs: missingNrs };
}

let hwViewMode = 'detailed';

function renderHomework(classId) {
    const students = DB.getStudentsForClass(classId);
    const plan = sortedPlan(classId);
    const isDG = isDGClass(classId);
    const globalSettings = DB.loadGlobalSettings();
    const schoolYearStart = globalSettings.schoolYearStart || '';
    const schoolYearEnd = globalSettings.schoolYearEnd || '';
    let hws = plan.filter(e => e.homeworkNr).map(e => ({ nr: e.homeworkNr, date: e.date }));
    if (isDG) {
        hws = plan.filter(e => e.homeworkNr).map(e => ({ nr: e.homeworkNr, date: e.date, sheets: (e.homeworkSheets || '') }));
    }
    if (schoolYearStart && schoolYearEnd) {
        hws = hws.filter(h => h.date >= schoolYearStart && h.date <= schoolYearEnd);
    }
    const seen = new Set();
    hws = hws.filter(h => {
        const key = h.nr + '|' + h.date;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const status = DB.loadHwStatus(classId);
    let html = '<div class="view-header"><div><h2>Hausübungen</h2><p class="subtitle">Kompakt: nur Note/Fehlend. Detail: Matrix mit „korrigiert/abgesammelt" pro HÜ – leere Zelle bei korrigierter HÜ = automatisch erbracht.</p></div>' +
        '<div class="grading-controls">' +
        '<button class="btn ' + (hwViewMode === 'compact' ? '' : 'btn-secondary') + '" onclick="setHwView(\'compact\')">Kompakt</button>' +
        '<button class="btn ' + (hwViewMode === 'detailed' ? '' : 'btn-secondary') + '" onclick="setHwView(\'detailed\')">Detail</button>' +
        '<button class="btn btn-secondary" onclick="openHwListModal(\'' + classId + '\')">HÜ-Liste / Fristen</button>' +
        '<button class="btn btn-secondary" onclick="showAllMissingHwModal(\'' + classId + '\')">Fehlende HÜs (alle)</button>' +
        '</div></div>';
    if (!hws.length) {
        html += '<p class="subtitle">Lege zuerst Stunden mit Hausübungen in der Stundenplanung an, damit hier die Hausübungsnummern erscheinen.</p>';
        return html;
    }
    if (hwViewMode === 'detailed') return html + renderHomeworkDetailed(classId, students, hws);
    html += '<table class="grading-table"><thead><tr><th>Schüler</th><th>Note</th><th>Fehlend</th><th>abgesammelt</th><th></th></tr></thead><tbody>';
    students.forEach(s => {
        const calc = computeHwGrade(classId, s.id, hws);
        const collected = hws.filter(h => {
            const cell = status[s.id] && status[s.id][h.nr] ? status[s.id][h.nr] : {};
            return cell.collected || cell.status === 'collected';
        }).length;
        const missingText = calc.missingNrs && calc.missingNrs.length ? 'Fehlende HÜs: ' + calc.missingNrs.join(', ') : (calc.missing ? 'Fehlende (' + calc.missing + ')' : '–');
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>' +
            '<td class="' + gradeClass(calc.grade) + ' grade-cell">' + (calc.grade != null ? calc.grade : '–') + '</td>' +
            '<td><button class="btn btn-secondary" onclick="showMissingHwModal(\'' + classId + '\',\'' + s.id + '\')">Fehlende (' + calc.missing + ')</button></td>' +
            '<td>' + collected + ' / ' + hws.length + '</td>' +
            '<td><button class="btn" onclick="setHwView(\'detailed\')">Details</button></td></tr>';
    });
    html += '</tbody></table>';
    return html;
}

function setHwView(mode) {
    hwViewMode = mode;
    renderGrading();
}

function renderHomeworkDetailed(classId, students, hws) {
    const isDG = isDGClass(classId);
    const status = DB.loadHwStatus(classId);
    const corrected = DB.loadHwCorrected(classId);
    const expired = DB.loadHwExpired(classId);
    let html = '<div class="hw-grid-wrap"><table class="grading-table hw-detail-table"><thead><tr><th class="hw-sticky-left">Schüler</th>';
    if (isDG) {
        const columns = [];
        hws.forEach(h => {
            const sheets = (h.sheets || '').split(',').map(s => s.trim()).filter(Boolean);
            sheets.forEach(name => {
                columns.push({ hwNr: h.nr, sheet: name, date: h.date });
            });
        });
        columns.forEach(col => {
            html += '<th class="hw-col">' + escapeHtml(col.sheet) + '<br><small>' + formatDateShortDE(col.date) + '</small></th>';
        });
    } else {
        hws.forEach(h => {
            const corr = corrected[h.nr] ? 'checked' : '';
            const isExpired = !!expired[h.nr];
            html += '<th class="hw-col' + (isExpired ? ' hw-expired-col' : '') + '">HÜ ' + h.nr + '<br><small>' + formatDateShortDE(h.date) + '</small>' +
                (isExpired ? '<br><small class="hw-expired-label">Frist abgelaufen</small>' : '') +
                '<br><label class="hw-corr" title="von mir korrigiert / abgesammelt"><input type="checkbox" ' + corr + ' onchange="toggleHwCorrected(\'' + classId + '\',' + h.nr + ',this.checked)"> korr.</label></th>';
        });
    }
    html += '<th class="hw-sticky-right">Fehlend</th><th class="hw-sticky-right-last">Note</th></tr></thead><tbody>';
    students.forEach(s => {
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>';
        if (isDG) {
            const columns = [];
            hws.forEach(h => {
                const sheets = (h.sheets || '').split(',').map(s => s.trim()).filter(Boolean);
                sheets.forEach(name => {
                    columns.push({ hwNr: h.nr, sheet: name });
                });
            });
            columns.forEach(col => {
                const cell = status[s.id] && status[s.id][col.hwNr] ? status[s.id][col.hwNr] : {};
                const val = getDGHwSheetValue(cell, col.sheet);
                const selClass = (val === '0' || val === 'k') ? ' hw-status-' + val : '';
                html += '<td class="hw-cell">' +
                    '<select class="hw-status' + selClass + '" onchange="window.setHwSheetStatus(\'' + classId + '\',\'' + s.id + '\',' + col.hwNr + ',\'' + col.sheet.replace(/'/g, "\\'") + '\',this.value)">' + hwStatusOptions(val, classId) + '</select>' +
                    '</td>';
            });
        } else {
            hws.forEach(h => {
                const cell = status[s.id] && status[s.id][h.nr] ? status[s.id][h.nr] : {};
                const selClass = cell.status ? ' hw-status-' + cell.status : '';
                html += '<td class="hw-cell">' +
                    '<select class="hw-status' + selClass + '" onchange="setHwStatus(\'' + classId + '\',\'' + s.id + '\',' + h.nr + ',this.value)">' + hwStatusOptions(cell.status) + '</select>' +
                    '</td>';
            });
        }
        const calc = computeHwGrade(classId, s.id, hws);
        html += '<td class="hw-sticky-right ' + gradeClass(calc.missing) + ' grade-cell"><button class="btn btn-secondary" onclick="showMissingHwModal(\'' + classId + '\',\'' + s.id + '\')">' + (calc.missing != null ? calc.missing : '–') + '</button></td>';
        html += '<td class="hw-sticky-right-last ' + gradeClass(calc.grade) + ' grade-cell">' + (calc.grade != null ? calc.grade : '–') + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
}

function toggleHwCorrected(classId, hwNr, val) {
    captureUndo();
    const wrap = document.querySelector('.hw-grid-wrap');
    const scrollLeft = wrap ? wrap.scrollLeft : 0;
    const obj = DB.loadHwCorrected(classId);
    if (val) obj[hwNr] = true; else delete obj[hwNr];
    DB.saveHwCorrected(classId, obj);
    renderGrading();
    requestAnimationFrame(() => {
        const w = document.querySelector('.hw-grid-wrap');
        if (w) w.scrollLeft = scrollLeft;
    });
}

function showMissingHwModal(classId, studentId) {
    const plan = filterPlanBySchoolYear(sortedPlan(classId).filter(e => e.homeworkNr));
    const isDG = isDGClass(classId);
    const status = DB.loadHwStatus(classId);
    const corrected = DB.loadHwCorrected(classId);
    const student = DB.loadStudents().find(s => s.id === studentId);
    const name = student ? escapeHtml(student.name) : 'Schüler';
    const st = status[studentId] || {};
    const missing = [];
    const sick = [];
    const improve = [];
    plan.forEach(h => {
        if (isDG) {
            const sheets = (h.homeworkSheets || '').split(',').map(s => s.trim()).filter(Boolean);
            const cell = st[h.homeworkNr] || {};
            sheets.forEach(name => {
                const val = cell.status && typeof cell.status === 'object' ? (cell.status[name] || '') : '';
                if (val === 'k') sick.push(h.homeworkNr + '/' + name);
                else if (val === 'improve') improve.push(h.homeworkNr + '/' + name);
                else if (val === 'done' || val === 'improved' || val === 'collected') return;
                else if (val === 'forgotten' || val === '0' || val === '') missing.push(h.homeworkNr + '/' + name);
            });
        } else {
            const cell = st[h.homeworkNr];
            const s = cell ? cell.status : '';
            if (s === 'sick') sick.push(h.homeworkNr);
            else if (s === 'improve') improve.push(h.homeworkNr);
            else if (s === 'done' || s === 'improved' || s === 'collected') return;
            else if (s === 'forgotten') missing.push(h.homeworkNr);
            else if (!corrected[h.homeworkNr]) missing.push(h.homeworkNr);
        }
    });
    let html = '<div class="modal-header"><h2>Hausübungs-Status – ' + name + '</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>';
    html += '<div class="form-group exam-form">';
    if (!plan.length) {
        html += '<p>Keine Hausübungen vorhanden.</p>';
    } else {
        html += '<p><strong>Fehlend (' + missing.length + '):</strong> ' + (missing.length ? missing.join(', ') : '–') + '</p>';
        html += '<p><strong>k (' + sick.length + '):</strong> ' + (sick.length ? sick.join(', ') : '–') + '</p>';
        html += '<p><strong>V! (' + improve.length + '):</strong> ' + (improve.length ? improve.join(', ') : '–') + '</p>';
    }
    html += '</div>';
    showModal(html);
}

function showAllMissingHwModal(classId) {
    const plan = filterPlanBySchoolYear(sortedPlan(classId).filter(e => e.homeworkNr));
    const isDG = isDGClass(classId);
    const status = DB.loadHwStatus(classId);
    const corrected = DB.loadHwCorrected(classId);
    const students = DB.getStudentsForClass(classId);
    
    if (!students.length || !plan.length) {
        showModal('<div class="modal-header"><h2>Fehlende Hausübungen</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div><p>Keine Daten vorhanden.</p>');
        return;
    }
    
    let html = '<div class="modal-header"><h2>Fehlende Hausübungen – Alle Schüler</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>';
    html += '<div style="margin-bottom:10px;"><button class="btn" onclick="window.print()">🖨️ Drucken</button></div>';
    html += '<div class="form-group exam-form" style="max-height:70vh;overflow-y:auto;">';
    
    students.forEach(s => {
        const st = status[s.id] || {};
        const missing = [];
        const sick = [];
        const improve = [];
        
        plan.forEach(h => {
            if (isDG) {
                const sheets = (h.homeworkSheets || '').split(',').map(s => s.trim()).filter(Boolean);
                const cell = st[h.homeworkNr] || {};
                sheets.forEach(name => {
                    const val = cell.status && typeof cell.status === 'object' ? (cell.status[name] || '') : '';
                    if (val === 'k') sick.push(h.homeworkNr + '/' + name);
                    else if (val === 'improve') improve.push(homeworkNr + '/' + name);
                    else if (val === 'done' || val === 'improved' || val === 'collected') return;
                    else if (val === 'forgotten' || val === '0' || val === '') missing.push(h.homeworkNr + '/' + name);
                });
            } else {
                const cell = st[h.homeworkNr];
                const s = cell ? cell.status : '';
                if (s === 'sick') sick.push(h.homeworkNr);
                else if (s === 'improve') improve.push(h.homeworkNr);
                else if (s === 'done' || s === 'improved' || s === 'collected') return;
                else if (s === 'forgotten') missing.push(h.homeworkNr);
                else if (!corrected[h.homeworkNr]) missing.push(h.homeworkNr);
            }
        });
        
        if (missing.length || sick.length || improve.length) {
            html += '<div style="margin-bottom:12px;padding:8px 12px;border-left:3px solid var(--border-color);">';
            html += '<strong style="display:block;margin-bottom:4px;">' + escapeHtml(s.name) + '</strong>';
            html += '<ul style="margin:0;padding-left:18px;line-height:1.6;">';
            if (missing.length) {
                html += '<li style="color:#fca5a5;"><strong>Fehlend:</strong> ' + missing.join(', ') + '</li>';
            }
            if (sick.length) {
                html += '<li style="color:#fde047;"><strong>k:</strong> ' + sick.join(', ') + '</li>';
            }
            if (improve.length) {
                html += '<li style="color:#93c5fd;"><strong>V!:</strong> ' + improve.join(', ') + '</li>';
            }
            html += '</ul></div>';
        }
    });
    
    html += '</div>';
    showModal(html);
}

function renderMissingHwOverview(classId) {
    const plan = filterPlanBySchoolYear(sortedPlan(classId).filter(e => e.homeworkNr));
    const isDG = isDGClass(classId);
    const status = DB.loadHwStatus(classId);
    const corrected = DB.loadHwCorrected(classId);
    const students = DB.getStudentsForClass(classId);
    const cls = DB.loadClasses().find(c => c.id === classId);
    const className = cls ? escapeHtml(cls.name) : '';
    
    if (!students.length || !plan.length) {
        return '<p class="subtitle">Keine Hausübungen vorhanden.</p>';
    }
    
    let html = '<div class="view-header"><div><h2>Fehlende Hausübungen – ' + className + '</h2><p class="subtitle">Übersicht aller fehlenden, kranken und zu verbessernden Hausübungen.</p></div>' +
        '<div class="grading-controls">' +
        '<button class="btn" onclick="window.print()">🖨️ Drucken</button>' +
        '</div></div>';
    
    html += '<table class="grading-table missing-hw-table"><thead><tr><th class="hw-sticky-left">Schüler</th>';
    
    if (isDG) {
        const columns = [];
        plan.forEach(h => {
            const sheets = (h.homeworkSheets || '').split(',').map(s => s.trim()).filter(Boolean);
            sheets.forEach(name => {
                columns.push({ hwNr: h.nr, sheet: name, date: h.date });
            });
        });
        columns.forEach(col => {
            html += '<th>' + escapeHtml(col.sheet) + '<br><small>' + formatDateShortDE(col.date) + '</small></th>';
        });
    } else {
        plan.forEach(h => {
            html += '<th>HÜ ' + h.nr + '<br><small>' + formatDateShortDE(h.date) + '</small></th>';
        });
    }
    html += '</tr></thead><tbody>';
    
    students.forEach(s => {
        const st = status[s.id] || {};
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>';
        
        if (isDG) {
            const columns = [];
            plan.forEach(h => {
                const sheets = (h.homeworkSheets || '').split(',').map(s => s.trim()).filter(Boolean);
                sheets.forEach(name => {
                    columns.push({ hwNr: h.nr, sheet: name });
                });
            });
            columns.forEach(col => {
                const cell = st[col.hwNr] || {};
                const val = cell.status && typeof cell.status === 'object' ? (cell.status[col.sheet] || '') : '';
                let cellClass = '';
                let cellText = '';
                if (val === 'k') { cellClass = 'hw-status-sick'; cellText = 'k'; }
                else if (val === 'improve') { cellClass = 'hw-status-improve'; cellText = 'V!'; }
                else if (val === 'done' || val === 'improved' || val === 'collected') { cellText = '✓'; }
                else if (val === 'forgotten' || val === '0' || val === '') { cellClass = 'hw-status-forgotten'; cellText = '✗'; }
                else cellText = '–';
                html += '<td class="' + cellClass + '" style="text-align:center;">' + cellText + '</td>';
            });
        } else {
            plan.forEach(h => {
                const cell = st[h.nr];
                const s = cell ? cell.status : '';
                let cellClass = '';
                let cellText = '';
                if (s === 'sick') { cellClass = 'hw-status-sick'; cellText = 'k'; }
                else if (s === 'improve') { cellClass = 'hw-status-improve'; cellText = 'V!'; }
                else if (s === 'done' || s === 'improved' || s === 'collected') { cellText = '✓'; }
                else if (s === 'forgotten') { cellClass = 'hw-status-forgotten'; cellText = '✗'; }
                else if (!corrected[h.nr]) { cellClass = 'hw-status-forgotten'; cellText = '✗'; }
                else cellText = '–';
                html += '<td class="' + cellClass + '" style="text-align:center;">' + cellText + '</td>';
            });
        }
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    return html;
}

function openHwListModal(classId) {
    const hws = filterPlanBySchoolYear(sortedPlan(classId).filter(e => e.homeworkNr)).map(e => ({ nr: e.homeworkNr, date: e.date, sheets: e.homeworkSheets || '' }));
    const expired = DB.loadHwExpired(classId);
    const isDG = isDGClass(classId);
    let html = '<div class="modal-header"><h2>Hausübungs-Liste</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>';
    html += '<div class="hw-expired-list">';
    if (!hws.length) html += '<p>Keine Hausübungen vorhanden.</p>';
    hws.forEach(h => {
        let label = 'HÜ ' + h.nr;
        if (isDG && h.sheets) label += ' – ' + escapeHtml(h.sheets);
        label += ' (' + formatDateDE(h.date) + ')';
        html += '<label class="hw-expired-item"><input type="checkbox" ' + (expired[h.nr] ? 'checked' : '') + ' onchange="toggleHwExpired(\'' + classId + '\',' + h.nr + ',this.checked)"> ' + label + '</label>';
    });
    html += '</div>';
    showModal(html);
}

function setHwStatus(classId, studentId, hwNr, status) {
    captureUndo();
    DB.setHwStatus(classId, studentId, hwNr, status, undefined);
    renderGrading();
}

function setHwCollected(classId, studentId, hwNr, collected) {
    captureUndo();
    DB.setHwStatus(classId, studentId, hwNr, undefined, collected);
    renderGrading();
}

function setExamExamplePoints(classId, studentId, examId, exampleId, points, inputEl) {
    captureUndo();
    DB.setExamExamplePoints(classId, studentId, examId, exampleId, points);
    const exam = (DB.loadExams(classId) || []).find(e => e.id === examId);
    if (inputEl) {
        const row = inputEl.closest('tr');
        const rec = DB.loadExamRecords(classId);
        const studentRec = (rec[studentId] && rec[studentId][examId]) ? rec[studentId][examId] : { examplePoints: {}, returned: false };
        if (row && exam) {
            let sum = 0;
            let hasAnyPoints = false;
            const subSet = new Set((exam.subtotals || []).filter(p => p >= 1 && p < exam.examples.length));
            let prevBoundary = 0;
            const subtotalCells = row.querySelectorAll('[data-subtot-cell]');
            let subtotalIdx = 0;
            exam.examples.forEach((ex, i) => {
                const pts = (studentRec.examplePoints && studentRec.examplePoints[ex.id] != null) ? studentRec.examplePoints[ex.id] : '';
                if (pts !== '' && !isNaN(pts)) { sum += parseFloat(pts); hasAnyPoints = true; }
                if (subSet.has(i + 1)) {
                    let blockSum = 0, blockMax = 0;
                    for (let k = prevBoundary; k <= i; k++) {
                        const bp = (studentRec.examplePoints && studentRec.examplePoints[exam.examples[k].id] != null) ? studentRec.examplePoints[exam.examples[k].id] : '';
                        if (bp !== '' && !isNaN(bp)) blockSum += parseFloat(bp);
                        blockMax += exam.examples[k].maxPoints;
                    }
                    if (subtotalCells[subtotalIdx]) subtotalCells[subtotalIdx].innerHTML = '<strong>' + blockSum + '</strong>';
                    subtotalIdx++;
                    prevBoundary = i + 1;
                }
            });
            const sumCell = row.querySelector('.exam-sum-cell');
            const gradeCell = row.querySelector('.exam-grade-cell');
            if (sumCell) sumCell.innerHTML = '<strong>' + (exam.maxPoints > 0 ? sum : '–') + '</strong>';
            if (gradeCell) {
                const g = (exam.maxPoints > 0 && hasAnyPoints) ? pointsToGrade(sum, exam.maxPoints, exam.gradeScale) : null;
                gradeCell.className = 'exam-grade-cell ' + gradeClass(g) + ' grade-cell';
                gradeCell.textContent = g != null ? g : '–';
            }
            const statsEl = document.getElementById('exam-stats-' + examId);
            if (statsEl) statsEl.innerHTML = renderExamStats(classId, exam);
            return;
        }
    }
    renderGrading();
}

function setExamReturned(classId, studentId, examId, returned, inputEl) {
    captureUndo();
    DB.setExamReturned(classId, studentId, examId, returned);
    if (inputEl) {
        const row = inputEl.closest('tr');
        if (row) {
            const rec = DB.loadExamRecords(classId);
            const exam = (DB.loadExams(classId) || []).find(e => e.id === examId);
            const studentRec = (rec[studentId] && rec[studentId][examId]) ? rec[studentId][examId] : { examplePoints: {}, returned: false };
            const returnCell = row.querySelector('.exam-return-cell');
            if (returnCell) {
                returnCell.innerHTML = '<span class="print-pts">' + (studentRec.returned ? '✓' : '–') + '</span><input type="checkbox" ' + (studentRec.returned ? 'checked' : '') + ' ' + (studentRec.absent ? 'disabled' : '') + ' onchange="setExamReturned(\'' + classId + '\',\'' + studentId + '\',\'' + examId + '\',this.checked,this)">';
            }
            const statsEl = document.getElementById('exam-stats-' + examId);
            if (statsEl && exam) statsEl.innerHTML = renderExamStats(classId, exam);
            return;
        }
    }
    renderGrading();
}

function setExamAbsent(classId, studentId, examId, absent, inputEl) {
    captureUndo();
    DB.setExamAbsent(classId, studentId, examId, absent);
    if (inputEl) {
        const row = inputEl.closest('tr');
        if (row) {
            const rec = DB.loadExamRecords(classId);
            const exam = (DB.loadExams(classId) || []).find(e => e.id === examId);
            const studentRec = (rec[studentId] && rec[studentId][examId]) ? rec[studentId][examId] : { examplePoints: {}, returned: false };
            const gradeCell = row.querySelector('.exam-grade-cell');
            const sumCell = row.querySelector('.exam-sum-cell');
            const returnCell = row.querySelector('.exam-return-cell');
            const inputs = row.querySelectorAll('.ex-pts-input');
            inputs.forEach(inp => inp.disabled = !!absent);
            if (gradeCell) {
                const g = absent ? 'A' : ((exam.maxPoints > 0 && hasAnyPointsForRec(studentRec, exam)) ? pointsToGrade(sumPointsForRec(studentRec, exam), exam.maxPoints, exam.gradeScale) : null);
                gradeCell.className = 'exam-grade-cell exam-sticky-right ' + (absent ? 'grade-absent' : (gradeClass(g) + ' grade-cell'));
                gradeCell.textContent = g != null ? g : '–';
            }
            if (sumCell) {
                sumCell.innerHTML = '<strong>' + (absent ? '–' : (exam.maxPoints > 0 ? sumPointsForRec(studentRec, exam) : '–')) + '</strong>';
            }
            if (returnCell) {
                returnCell.innerHTML = '<span class="print-pts">' + (studentRec.returned ? '✓' : '–') + '</span><input type="checkbox" ' + (studentRec.returned ? 'checked' : '') + ' ' + (absent ? 'disabled' : '') + ' onchange="setExamReturned(\'' + classId + '\',\'' + studentId + '\',\'' + examId + '\',this.checked,this)">';
            }
            const statsEl = document.getElementById('exam-stats-' + examId);
            if (statsEl && exam) statsEl.innerHTML = renderExamStats(classId, exam);
            return;
        }
    }
    renderGrading();
}

function hasAnyPointsForRec(rec, exam) {
    if (!rec || !rec.examplePoints || !exam || !exam.examples) return false;
    const validIds = new Set(exam.examples.map(ex => ex.id));
    return exam.examples.some(ex => {
        const p = rec.examplePoints[ex.id];
        return p !== undefined && p !== null && p !== '' && !isNaN(parseFloat(p));
    });
}

function sumPointsForRec(rec, exam) {
    if (!rec || !rec.examplePoints || !exam || !exam.examples) return 0;
    let sum = 0;
    exam.examples.forEach(ex => {
        const p = rec.examplePoints[ex.id];
        if (p !== undefined && p !== null && p !== '' && !isNaN(parseFloat(p))) sum += parseFloat(p);
    });
    return sum;
}

function toggleHwExpired(classId, hwNr, val) {
    captureUndo();
    const obj = DB.loadHwExpired(classId);
    if (val) obj[hwNr] = true; else delete obj[hwNr];
    DB.saveHwExpired(classId, obj);
    renderGrading();
}

/* ============ SCHULARBEITEN ============ */
function examExampleRowHtml(label, pts) {
    return '<div class="exam-ex-row" style="display:flex;gap:8px;margin-bottom:6px;"><input type="text" class="ex-label" placeholder="Beispiel (z.B. 1)" value="' + escapeHtml(label || '') + '"><input type="number" class="ex-pts" placeholder="Punkte" value="' + (pts != null ? pts : '') + '"><button class="btn btn-secondary" type="button" onclick="this.parentElement.remove()">×</button></div>';
}

function openExamModal(classId, id) {
    let exam = null;
    if (id) exam = DB.loadExams(classId).find(e => e.id === id);
    let exRows = '';
    if (exam) exam.examples.forEach(ex => exRows += examExampleRowHtml(ex.label, ex.maxPoints));
    else exRows = examExampleRowHtml('', 12);
    let gradeScaleHtml = '';
    const prevExam = id ? null : (DB.loadExams(classId) || []).slice(-1)[0];
    const scale = (exam && exam.gradeScale) ? exam.gradeScale : (prevExam && prevExam.gradeScale) ? prevExam.gradeScale : defaultGradeScale();
    const maxP = (exam && exam.maxPoints) ? exam.maxPoints : ((prevExam && prevExam.maxPoints) ? prevExam.maxPoints : 48);
    gradeScaleHtml += '<label>Notenschlüssel (Punkte)</label><div id="grade-scale-editor">';
    gradeScaleHtml += '<div style="display:flex;flex-direction:column;gap:6px;">';
    [1,2,3,4,5].forEach(g => {
        const item = scale.find(s => s.grade === g);
        const minVal = item && item.minPoints != null ? item.minPoints : '';
        const maxVal = item && item.maxPoints != null ? item.maxPoints : '';
        gradeScaleHtml += '<div style="display:flex;align-items:center;gap:8px;"><span style="width:60px;">Note ' + g + '</span><input type="number" step="0.5" class="grade-scale-min-input" data-grade="' + g + '" value="' + minVal + '" placeholder="von" style="flex:1;"><span style="color:var(--text-muted);font-size:12px;">bis</span><input type="number" step="0.5" class="grade-scale-max-input" data-grade="' + g + '" value="' + maxVal + '" placeholder="bis" style="flex:1;"><span style="color:var(--text-muted);font-size:12px;">P</span></div>';
    });
    gradeScaleHtml += '</div></div>';
    showModal(
        '<div class="modal-header"><h2>' + (id ? 'Schularbeit bearbeiten' : 'Neue Schularbeit') + '</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<div class="form-group exam-form">' +
        '<label>Titel</label><input type="text" id="exam-title" value="' + escapeHtml(exam ? exam.title : '') + '">' +
        '<label>Datum (optional, für Semesterfilter)</label><input type="date" id="exam-date" value="' + (exam && exam.date ? escapeHtml(exam.date) : '') + '">' +
        '<label>Beispiele (Aufgaben)</label>' +
        '<div id="exam-examples">' + exRows + '</div>' +
        '<button class="btn btn-secondary" type="button" onclick="addExamExampleRow()">+ Beispiel</button>' +
        '<label>Zwischensummen nach Beispiel-Position (optional, kommagetrennt, z.B. 3, 6)</label>' +
        '<input type="text" id="exam-subtotals" value="' + (exam && exam.subtotals ? exam.subtotals.join(', ') : '') + '" placeholder="z.B. 3, 6">' +
        gradeScaleHtml +
        '<button class="btn" onclick="saveExam(\'' + classId + '\',\'' + (id || '') + '\')">Speichern</button>' +
        '</div>'
    );
}

function addExamExampleRow() {
    document.getElementById('exam-examples').insertAdjacentHTML('beforeend', examExampleRowHtml('', 12));
}

function saveExam(classId, id) {
    captureUndo();
    const title = document.getElementById('exam-title').value;
    const date = document.getElementById('exam-date').value;
    if (!title) { alert('Titel angeben'); return; }
    const examples = [];
    document.querySelectorAll('#exam-examples .exam-ex-row').forEach(row => {
        const l = row.querySelector('.ex-label').value;
        const p = row.querySelector('.ex-pts').value;
        if (l || p) examples.push({ id: Date.now().toString() + Math.random().toString().slice(2, 6), label: l, maxPoints: parseFloat(p) || 0 });
    });
    const subtotalsEl = document.getElementById('exam-subtotals');
    let subtotals = [];
    if (subtotalsEl) {
        subtotals = subtotalsEl.value.split(/[,;\s]+/)
            .map(x => parseInt(x, 10))
            .filter(n => !isNaN(n) && n >= 1 && n < examples.length);
        subtotals = Array.from(new Set(subtotals)).sort((a, b) => a - b);
    }
    const gradeScaleInputsMin = document.querySelectorAll('.grade-scale-min-input');
    const gradeScaleInputsMax = document.querySelectorAll('.grade-scale-max-input');
    const gradeScale = [];
    gradeScaleInputsMin.forEach(input => {
        const grade = parseInt(input.dataset.grade);
        const min = parseFloat(input.value) || 0;
        const max = gradeScaleInputsMax.length ? (parseFloat(document.querySelector('.grade-scale-max-input[data-grade="' + grade + '"]').value) || 0) : 0;
        gradeScale.push({ grade: grade, minPoints: min, maxPoints: max });
    });
    if (id) {
        const exams = DB.loadExams(classId);
        const ex = exams.find(e => e.id === id);
        ex.title = title; ex.date = date; ex.examples = examples; ex.maxPoints = examples.reduce((s, e) => s + e.maxPoints, 0); ex.gradeScale = gradeScale; ex.subtotals = subtotals;
        DB.saveExams(classId, exams);
    } else {
        DB.addExam(classId, title, examples, date);
        const exams = DB.loadExams(classId);
        const ex = exams[exams.length - 1];
        ex.gradeScale = gradeScale;
        ex.subtotals = subtotals;
        DB.saveExams(classId, exams);
    }
    hideModal();
    renderGrading();
}

function deleteExamConfirm(classId, examId) {
    captureUndo();
    if (confirm('Schularbeit wirklich löschen?')) {
        DB.deleteExam(classId, examId);
        currentExamId = null;
        renderGrading();
    }
}

function setCurrentExam(id) {
    currentExamId = id;
    renderGrading();
}

function hasExamPoints(rec, exam) {
    if (!rec || !rec.examplePoints || !exam || !exam.examples) return false;
    const validIds = new Set(exam.examples.map(ex => ex.id));
    return exam.examples.some(ex => {
        const p = rec.examplePoints[ex.id];
        return p !== undefined && p !== null && p !== '' && !isNaN(parseFloat(p));
    });
}

function renderExamTable(classId, exam) {
    const students = DB.getStudentsForClass(classId);
    const records = DB.loadExamRecords(classId);
    const subs = (exam.subtotals || []).filter(p => p >= 1 && p < exam.examples.length);
    const subSet = new Set(subs);
    let html = '<div class="hw-grid-wrap"><table class="grading-table exam-table" id="exam-print-area"><thead><tr><th class="exam-sticky-left">Schüler</th>';
    let prevBoundary = 0;
    exam.examples.forEach((ex, i) => {
        html += '<th class="exam-ex-col">' + escapeHtml(ex.label || '') + '<br><small>' + ex.maxPoints + ' P</small></th>';
        const ord = i + 1;
        if (subSet.has(ord)) {
            let blockMax = 0;
            for (let k = prevBoundary; k <= i; k++) blockMax += exam.examples[k].maxPoints;
            html += '<th class="exam-subtotal-col">Σ<br><small>' + blockMax + ' P</small></th>';
            prevBoundary = i + 1;
        }
    });
    html += '<th class="exam-sum-cell exam-sticky-right">Σ / ' + exam.maxPoints + '</th><th class="exam-sticky-right exam-grade-col">Note</th><th class="exam-sticky-right">zurück</th><th class="exam-sticky-right">abwesend</th></tr></thead><tbody>';
    students.forEach((s, rowIdx) => {
        const rec = (records[s.id] && records[s.id][exam.id]) ? records[s.id][exam.id] : { examplePoints: {}, returned: false };
        const isAbsent = !!rec.absent;
        let sum = 0;
        let blockSum = 0;
        let hasAnyPoints = false;
        html += '<tr><td class="exam-sticky-left">' + studentNameHtml(s) + '</td>';
        const rowCells = [];
        exam.examples.forEach((ex, i) => {
            const pts = (!isAbsent && rec.examplePoints && rec.examplePoints[ex.id] != null) ? rec.examplePoints[ex.id] : '';
            if (pts !== '' && !isNaN(pts)) { sum += parseFloat(pts); blockSum += parseFloat(pts); hasAnyPoints = true; }
            html += '<td class="exam-ex-cell"><input type="number" class="grade-input ex-pts-input" data-row="' + rowIdx + '" data-col="' + i + '" value="' + pts + '" ' + (isAbsent ? 'disabled' : '') + ' onchange="setExamExamplePoints(\'' + classId + '\',\'' + s.id + '\',\'' + exam.id + '\',\'' + ex.id + '\',this.value,this)"></td>';
            if (subSet.has(i + 1)) {
                html += '<td class="exam-subtotal-cell" data-subtot-cell="1"><strong>' + blockSum + '</strong></td>';
                blockSum = 0;
            }
            rowCells.push(null);
        });
        examPointGrid[rowIdx] = rowCells;
        const g = isAbsent ? 'A' : ((exam.maxPoints > 0 && hasAnyPoints) ? pointsToGrade(sum, exam.maxPoints, exam.gradeScale) : null);
        html += '<td class="exam-sum-cell exam-sticky-right"><strong>' + (isAbsent ? '–' : (exam.maxPoints > 0 ? sum : '–')) + '</strong></td>';
        html += '<td class="exam-grade-cell exam-sticky-right ' + (isAbsent ? 'grade-absent' : (gradeClass(g) + ' grade-cell')) + '">' + (g != null ? g : '–') + '</td>';
        html += '<td class="exam-return-cell exam-sticky-right"><input type="checkbox" ' + (rec.returned ? 'checked' : '') + ' ' + (isAbsent ? 'disabled' : '') + ' onchange="setExamReturned(\'' + classId + '\',\'' + s.id + '\',\'' + exam.id + '\',this.checked,this)"></td>';
        html += '<td class="exam-absent-cell exam-sticky-right"><input type="checkbox" ' + (isAbsent ? 'checked' : '') + ' onchange="setExamAbsent(\'' + classId + '\',\'' + s.id + '\',\'' + exam.id + '\',this.checked,this)"></td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    examPointGrid = [];
    students.forEach((s, r) => { examPointGrid[r] = []; });
    setTimeout(function() {
        const table = document.getElementById('exam-print-area');
        if (!table) return;
        table.querySelectorAll('tbody tr').forEach((tr, r) => {
            let c = 0;
            tr.querySelectorAll('.ex-pts-input').forEach(inp => {
                if (examPointGrid[r]) examPointGrid[r][c] = inp;
                c++;
            });
        });
    }, 0);
    return html;
}

function renderExamStats(classId, exam, containerId) {
    const students = DB.getStudentsForClass(classId);
    const records = DB.loadExamRecords(classId);
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    students.forEach(s => {
        const rec = records[s.id] && records[s.id][exam.id];
        if (!rec || rec.absent) return;
        if (!hasExamPoints(rec, exam)) return;
        let sum = 0;
        const validIds = new Set(exam.examples.map(ex => ex.id));
        Object.entries(rec.examplePoints).forEach(([id, p]) => {
            if (!validIds.has(id)) return;
            const n = parseFloat(p);
            if (!isNaN(n)) sum += n;
        });
        const g = exam.maxPoints > 0 ? pointsToGrade(sum, exam.maxPoints, exam.gradeScale) : null;
        if (g) counts[g]++;
    });
    const idAttr = containerId ? ' id="' + containerId + '"' : '';
    return '<div' + idAttr + ' class="exam-stats">Statistik: ' + [1, 2, 3, 4, 5].map(g => '<span class="stat-pill ' + gradeClass(g) + '">' + g + ': ' + counts[g] + '</span>').join(' ') + '</div>';
}

function renderExamsView(classId) {
    const exams = DB.loadExams(classId);
    const cls = DB.loadClasses().find(c => c.id === classId);
    const className = cls ? escapeHtml(cls.name) : '';
    let html = '<div class="view-header"><div><h2>Schularbeiten</h2></div>' +
        '<div class="grading-controls">' +
        (exams.length ? '<select id="exam-select" class="btn btn-secondary" onchange="setCurrentExam(this.value)">' + exams.map(e => '<option value="' + e.id + '"' + (currentExamId === e.id ? ' selected' : '') + '>' + escapeHtml(e.title) + '</option>').join('') + '</select>' : '') +
        '<button class="btn" onclick="openExamModal(\'' + classId + '\')">+ Neue Schularbeit</button>' +
        '<button class="btn btn-secondary" onclick="printExam()">🖨️ Drucken</button>' +
        '</div></div>';
    if (!exams.length) { html += '<p class="subtitle">Noch keine Schularbeit angelegt.</p>'; return html; }
    if (!currentExamId || !exams.find(e => e.id === currentExamId)) currentExamId = exams[0].id;
    const exam = exams.find(e => e.id === currentExamId);
    html += '<div class="exam-header">' +
        '<h3>' + escapeHtml(exam.title) + '</h3>' +
        '<p class="subtitle">' + className + (exam.date ? ' &nbsp;|&nbsp; ' + formatDateDE(exam.date) : '') + '</p>' +
        '</div>';
    html += renderExamTable(classId, exam);
    html += renderExamStats(classId, exam, 'exam-stats-' + exam.id);
    html += '<div class="no-print" style="margin-top:15px;"><button class="btn btn-secondary" onclick="openExamModal(\'' + classId + '\',\'' + exam.id + '\')">✎ Bearbeiten</button> <button class="btn btn-secondary" onclick="deleteExamConfirm(\'' + classId + '\',\'' + exam.id + '\')">Schularbeit löschen</button></div>';
    return html;
}

function printExam() { window.print(); }

/* ============ PRÜFUNGEN ============ */
function renderPruefungen(classId) {
    const students = DB.getStudentsForClass(classId);
    const data = DB.loadPruefung(classId);
    let html = '<div class="view-header"><div><h2>Prüfungen</h2><p class="subtitle">Pro Schüler eine mündliche Prüfung mit Datum und Note.</p></div></div>';
    html += '<table class="grading-table"><thead><tr><th>Schüler</th><th>Datum</th><th>Note</th><th>Notiz</th></tr></thead><tbody>';
    students.forEach(s => {
        const d = data[s.id] || {};
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>' +
            '<td><input type="date" class="grade-input" style="width:auto;" value="' + escapeHtml(d.date || '') + '" onchange="setPruefung(\'' + classId + '\',\'' + s.id + '\',\'date\',this.value)"></td>' +
            '<td>' + gradeSelect(d.grade, "setPruefung('" + classId + "','" + s.id + "','grade',this.value)") + '</td>' +
            '<td><input type="text" class="grade-input" style="width:auto;min-width:160px;" value="' + escapeHtml(d.note || '') + '" onchange="setPruefung(\'' + classId + '\',\'' + s.id + '\',\'note\',this.value)"></td></tr>';
    });
    html += '</tbody></table>';
    return html;
}

function setPruefung(classId, studentId, field, value) {
    captureUndo();
    const data = DB.loadPruefung(classId);
    if (!data[studentId]) data[studentId] = {};
    data[studentId][field] = (field === 'grade') ? (value === '' ? null : parseInt(value)) : value;
    DB.savePruefung(classId, data);
    renderGrading();
}

/* ============ MITARBEIT ============ */
function renderMitarbeit(classId) {
    const students = DB.getStudentsForClass(classId);
    const data = DB.loadMitarbeit(classId);
    const status = DB.loadWorksheetStatus(classId);
    const mitTitle = isGZClass(classId) ? 'Mitarbeit und Mappe' : 'Mitarbeit';
    let html = '<div class="view-header"><div><h2>' + mitTitle + '</h2><p class="subtitle">Mappe (1. Semester und 2. Semester), Verhalten.</p></div></div>';
    html += '<table class="grading-table" id="mitarbeit-table"><thead><tr><th>Schüler</th><th>Mappe 1. Semester</th><th>Bemerkung 1. Sem.</th><th>Mappe 2. Semester</th><th>Bemerkung 2. Sem.</th><th>Verhalten (positiv/negativ)</th>' +
        (isGZClass(classId) ? '<th>Mitarbeit</th>' : '') + '</tr></thead><tbody>';
    students.forEach(s => {
        const d = data[s.id] || {};
        const st = status[s.id] || {};
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>' +
            '<td>' + gradeSelect(d.folder1, "setMitarbeit('" + classId + "','" + s.id + "','folder1',this.value)") + '</td>' +
            '<td><input type="text" class="grade-input" style="width:auto;min-width:200px;" value="' + escapeHtml(d.folderNote1 || '') + '" onchange="setMitarbeit(\'' + classId + '\',\'' + s.id + '\',\'folderNote1\',this.value)"></td>' +
            '<td>' + gradeSelect(d.folder2, "setMitarbeit('" + classId + "','" + s.id + "','folder2',this.value)") + '</td>' +
            '<td><input type="text" class="grade-input" style="width:auto;min-width:200px;" value="' + escapeHtml(d.folderNote2 || '') + '" onchange="setMitarbeit(\'' + classId + '\',\'' + s.id + '\',\'folderNote2\',this.value)"></td>' +
            '<td><input type="text" class="grade-input" style="width:auto;min-width:200px;" value="' + escapeHtml(d.note || '') + '" onchange="setMitarbeit(\'' + classId + '\',\'' + s.id + '\',\'note\',this.value)"></td>' +
            (isGZClass(classId) ? '<td>' + gradeSelect(st.attendance || '', "setGZAttendanceGrade('" + classId + "','" + s.id + "',this.value)") + '</td>' : '') +
            '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

function setMitarbeit(classId, studentId, field, value) {
    captureUndo();
    const data = DB.loadMitarbeit(classId);
    if (!data[studentId]) data[studentId] = {};
    data[studentId][field] = value;
    DB.saveMitarbeit(classId, data);
    renderGrading();
}

/* ============ ÜBERSICHT ============ */
function filterByScope(hws, exams, cutoff) {
    if (!cutoff) return { hws: hws, exams: exams };
    const h = hws.filter(x => !x.date || x.date <= cutoff);
    const e = exams.filter(x => !x.date || x.date <= cutoff);
    return { hws: h, exams: e };
}

function renderProjects(classId) {
    const students = DB.getStudentsForClass(classId);
    const data = DB.loadProjectGrades(classId);
    let html = '<div class="view-header"><div><h2>Projekt</h2></div></div>';
    html += '<table class="grading-table"><thead><tr><th>Schüler</th><th>Note</th><th>Rechtzeitig abgegeben</th><th>Bemerkung</th></tr></thead><tbody>';
    students.forEach(s => {
        const d = data[s.id] || {};
        const ot = d.onTime || '';
        const otLabel = ot === 'pos' ? '✓' : (ot === 'neg' ? '✗' : '');
        const otClass = ot === 'pos' ? 'gz-recv-ng' : (ot === 'neg' ? 'gz-recv-x' : '');
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>' +
            '<td>' + gradeSelectDecimal(d.grade, "setProjectGrade('" + classId + "','" + s.id + "',this.value)") + '</td>' +
            '<td style="text-align:center;"><button class="gz-toggle ' + otClass + '" title="Rechtzeitig abgegeben: ✓=ja, ✗=nein" onclick="toggleProjectOnTime(\'' + classId + '\',\'' + s.id + '\')">' + otLabel + '</button></td>' +
            '<td><input type="text" class="grade-input" style="width:auto;min-width:200px;" value="' + escapeHtml(d.note || '') + '" onchange="setProjectGrade(\'' + classId + '\',\'' + s.id + '\',this.value,\'note\')"></td></tr>';
    });
    html += '</tbody></table>';
    return html;
}

function setProjectGrade(classId, studentId, value, field) {
    captureUndo();
    const data = DB.loadProjectGrades(classId);
    if (!data[studentId]) data[studentId] = {};
    if (field === 'note') data[studentId].note = value;
    else data[studentId].grade = value === '' ? null : parseFloat(value);
    DB.saveProjectGrades(classId, data);
    renderGrading();
}

window.toggleProjectOnTime = function(classId, studentId) {
    captureUndo();
    const data = DB.loadProjectGrades(classId);
    if (!data[studentId]) data[studentId] = {};
    const cur = data[studentId].onTime || '';
    data[studentId].onTime = cur === '' ? 'pos' : (cur === 'pos' ? 'neg' : '');
    DB.saveProjectGrades(classId, data);
    renderGrading();
};

function renderOverview(classId) {
    const students = DB.getStudentsForClass(classId);
    const allHws = filterPlanBySchoolYear(sortedPlan(classId).filter(e => e.homeworkNr)).map(e => ({ nr: e.homeworkNr, date: e.date }));
    const exams = DB.loadExams(classId);
    const cutoff = DB.loadSemesterCutoff(classId);
    const scopeData = (gradeOverviewScope === 'semester') ? filterByScope(allHws, exams, cutoff) : { hws: allHws, exams: exams };
    const weights = DB.loadWeights(classId);
    const manual = DB.loadManualGrades(classId);
    const semesterManual = DB.loadSemesterManualGrades(classId);
    const isYear = gradeOverviewScope === 'year';

    let html = '<div class="view-header"><div><h2>Übersicht – ' + (isYear ? 'Ganzes Jahr' : '1. Semester') + '</h2>' +
        '<p class="subtitle">Gewichtung der Noten frei wählbar. Manuelle Note überschreibt die Berechnung.</p></div>' +
        '<div class="grading-controls">' +
        '<button class="btn ' + (isYear ? 'btn-secondary' : '') + '" onclick="setOverviewScope(\'semester\')">1. Semester</button>' +
        '<button class="btn ' + (isYear ? '' : 'btn-secondary') + '" onclick="setOverviewScope(\'year\')">Ganzes Jahr</button>' +
        '<button class="btn btn-secondary" onclick="window.openWeightsModal(\'' + classId + '\')">⚖️ Gewichtung</button>' +
        '</div></div>';

    html += '<div class="hw-grid-wrap"><table class="grading-table overview-table"><thead><tr>' +
        '<th>Schüler</th><th>HÜ<br><small>Pkte / Note</small></th>';
    scopeData.exams.forEach(e => html += '<th>SA ' + e.nr + '<br><small>Pkte / Note</small></th>');
    html += '<th>Ø SA</th><th>Prüf.</th><th>Projekt</th><th>Berechnet</th>';
    if (isYear) html += '<th>Note (1. Sem.)</th>';
    html += '<th>Note (ich)</th></tr></thead><tbody>';

    students.forEach(s => {
        const hw = computeHwGrade(classId, s.id, scopeData.hws);
        let examSum = 0, examCount = 0, examGrades = [];
        let examCells = '';
        scopeData.exams.forEach(e => {
            const rec = (DB.loadExamRecords(classId)[s.id] && DB.loadExamRecords(classId)[s.id][e.id]);
            const isAbsent = !!rec && rec.absent;
            let sum = 0, has = false;
            if (rec && rec.examplePoints) {
                has = true;
                Object.values(rec.examplePoints).forEach(p => sum += parseFloat(p) || 0);
            }
            const g = isAbsent ? 'A' : ((has && e.maxPoints > 0) ? percentToGrade(sum / e.maxPoints * 100) : null);
            if (g != null && g !== 'A') { examSum += g; examCount++; examGrades.push(g); }
            examCells += '<td><span class="ov-pts">' + (has && !isAbsent ? sum : '–') + '</span> / <span class="' + (isAbsent ? 'grade-absent' : gradeClass(g)) + ' grade-cell">' + (g != null ? g : '–') + '</span></td>';
        });
        const examAvg = examCount ? examSum / examCount : null;
        const pr = DB.loadPruefung(classId)[s.id];
        const pruefGrade = (pr && pr.grade != null) ? pr.grade : null;
        const projectData = DB.loadProjectGrades(classId)[s.id] || {};
        const projectGrade = projectData.grade != null ? projectData.grade : null;
        const w = DB.loadWeights(classId);
        let computed = null;
        const parts = [];
        if (hw.grade != null) parts.push(hw.grade * w.hw);
        if (examAvg != null) parts.push(examAvg * w.exam);
        if (pruefGrade != null) parts.push(pruefGrade * w.pruefung);
        if (projectGrade != null) parts.push(projectGrade * w.project);
        const wSum = (hw.grade != null ? w.hw : 0) + (examAvg != null ? w.exam : 0) + (pruefGrade != null ? w.pruefung : 0) + (projectGrade != null ? w.project : 0);
        if (parts.length && wSum > 0) computed = Math.round(parts.reduce((a, b) => a + b, 0) / wSum * 100) / 100;
        const activeManual = isYear ? (manual[s.id] != null ? manual[s.id] : null) : (semesterManual[s.id] != null ? semesterManual[s.id] : null);
        const semesterManualGrade = semesterManual[s.id] != null ? semesterManual[s.id] : null;

        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>' +
            '<td><span class="ov-pts">' + hw.points + '</span> / <span class="' + gradeClass(hw.grade) + ' grade-cell">' + (hw.grade != null ? hw.grade : '–') + '</span></td>' +
            examCells +
            '<td>' + (examAvg != null ? '<span class="' + gradeClass(Math.round(examAvg)) + ' grade-cell">' + (Math.round(examAvg * 10) / 10) + '</span>' : '–') + '</td>' +
            '<td>' + (pruefGrade != null ? '<span class="' + gradeClass(pruefGrade) + ' grade-cell">' + pruefGrade + '</span>' : '–') + '</td>' +
            '<td>' + (projectGrade != null ? '<span class="' + gradeClass(projectGrade) + ' grade-cell">' + projectGrade + '</span>' : '–') + '</td>' +
            '<td class="' + gradeClass(computed) + ' grade-cell">' + (computed != null ? computed : '–') + '</td>' +
            (isYear ? '<td class="' + gradeClass(semesterManualGrade) + ' grade-cell">' + (semesterManualGrade != null ? semesterManualGrade : '–') + '</td>' : '') +
            '<td>' + gradeSelect(activeManual, "setManualGrade('" + classId + "','" + s.id + "',this.value)") + '</td>' +
            '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
}

function setOverviewScope(scope) { gradeOverviewScope = scope; renderGrading(); }
function setSemesterCutoff(classId, val) { DB.saveSemesterCutoff(classId, val); renderGrading(); }
function setWeight(classId, key, val) { captureUndo(); const w = DB.loadWeights(classId); w[key] = parseFloat(val) || 0; DB.saveWeights(classId, w); renderGrading(); }
function setManualGrade(classId, studentId, val) {
    captureUndo();
    if (gradeOverviewScope === 'semester') {
        const m = DB.loadSemesterManualGrades(classId);
        if (val === '') delete m[studentId];
        else m[studentId] = parseInt(val);
        DB.saveSemesterManualGrades(classId, m);
    } else {
        const m = DB.loadManualGrades(classId);
        if (val === '') delete m[studentId];
        else m[studentId] = parseInt(val);
        DB.saveManualGrades(classId, m);
    }
    renderGrading();
}

window.openWeightsModal = function(classId) {
    const weights = DB.loadWeights(classId);
    showModal(
        '<div class="modal-header"><h2>Gewichtung</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<div class="form-group exam-form">' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
        '<label style="margin:0;">HÜ <input type="number" step="0.05" id="dg-w-hw" class="grade-input" style="width:60px;" value="' + (weights.hw || 0) + '"></label>' +
        '<label style="margin:0;">SA <input type="number" step="0.05" id="dg-w-exam" class="grade-input" style="width:60px;" value="' + (weights.exam || 0) + '"></label>' +
        '<label style="margin:0;">Prüf. <input type="number" step="0.05" id="dg-w-pruef" class="grade-input" style="width:60px;" value="' + (weights.pruefung || 0) + '"></label>' +
        '<label style="margin:0;">Projekt <input type="number" step="0.05" id="dg-w-project" class="grade-input" style="width:60px;" value="' + (weights.project || 0) + '"></label>' +
        '</div>' +
        '<button class="btn" onclick="saveWeights(\'' + classId + '\')" style="margin-top:10px;">Speichern</button>' +
        '</div>'
    );
};

window.saveWeights = function(classId) {
    captureUndo();
    const weights = {
        hw: parseFloat(document.getElementById('dg-w-hw').value) || 0,
        exam: parseFloat(document.getElementById('dg-w-exam').value) || 0,
        pruefung: parseFloat(document.getElementById('dg-w-pruef').value) || 0,
        project: parseFloat(document.getElementById('dg-w-project').value) || 0
    };
    DB.saveWeights(classId, weights);
    hideModal();
    renderGrading();
};

function openExamManagerFromSelect() {
    const classId = document.getElementById('grade-class-select').value;
    if (classId) { currentGradeTab = 'exam'; renderGrading(); }
}

function openClassGrading(classId) {
    switchView('grading');
    const select = document.getElementById('grade-class-select');
    if (select) {
        select.value = classId;
        renderGrading();
    }
}

function addTimeSlot() {
    const tbody = document.querySelector('#times-table tbody');
    const row = document.createElement('tr');
    row.innerHTML = '<td><input type="text" value="Neue Einheit"></td><td><input type="time" value="08:00"></td><td><input type="time" value="09:00"></td>';
    tbody.appendChild(row);
}

function saveTimeSettings() {
    captureUndo();
    const rows = document.querySelectorAll('#times-table tbody tr');
    const slots = [];
    rows.forEach(row => {
        const cells = row.querySelectorAll('input');
        const start = cells[0] ? cells[0].value : '';
        const end = cells[1] ? cells[1].value : '';
        const name = row.cells[0] ? row.cells[0].textContent.trim() : '';
        slots.push({ name: name, start: start, end: end });
    });
    DB.saveTimeSlots(slots);
    const cb = document.getElementById('show-fruehaufsicht');
    if (cb) DB.saveShowFruehaufsicht(cb.checked);
    const endInput = document.getElementById('timetable-end-time');
    if (endInput) DB.saveTimetableEndTime(endInput.value);
    const hideHol = document.getElementById('hide-holiday-columns');
    if (hideHol) DB.saveHideHolidayColumns(hideHol.checked);
    renderDashboard();
}

async function fetchAustrianHolidays() {
    const y = new Date().getFullYear();
    let holidays = [];
    for (const year of [y - 1, y, y + 1]) {
        try {
            const data = await DB.fetchHolidays(year);
            if (data && data.length) holidays = holidays.concat(data);
        } catch (e) {}
    }
    const school = expandSchoolHolidays(STEIERMARK_SCHOOL_HOLIDAYS);
    const map = {};
    holidays.forEach(h => { map[h.date] = h.localName || h.name; });
    school.forEach(pair => { map[pair[0]] = pair[1]; });
    const combined = Object.keys(map).sort().map(date => ({ date: date, name: map[date], localName: map[date] }));
    DB.saveHolidays(combined);
    renderHolidays();
}

function renderHolidays() {
    const list = DB.loadManualHolidays() || [];
    const container = document.getElementById('manual-holidays-list');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '<p class="subtitle" style="font-size:12px;">Keine Ferien eingetragen.</p>';
        return;
    }
    let html = '<table class="settings-table" style="width:100%;"><thead><tr><th>Bezeichnung</th><th>Von</th><th>Bis</th><th></th></tr></thead><tbody>';
    list.forEach((h, idx) => {
        html += '<tr><td>' + escapeHtml(h.name || '') + '</td><td>' + escapeHtml(h.from || '') + '</td><td>' + escapeHtml(h.to || '') + '</td>' +
            '<td><button class="btn btn-secondary" onclick="window.deleteManualHoliday(' + idx + ')">Löschen</button></td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function saveAutonomousDays() {
    const text = document.getElementById('autonomous-days').value;
    const days = text.split(/[\n,]+/).map(d => d.trim()).filter(d => d);
    DB.saveAutonomousDays(days);
}

function exportData() {
    const json = DB.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'planit-backup-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function backupSchoolYear() {
    const json = DB.exportSchoolDataOnly();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'planit-schuljahr-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.restoreBackup = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
            const data = JSON.parse(text);
            if (!confirm('Achtung: Dies überschreibt alle aktuellen Daten (Klassen, Schüler, Stundenplan, Noten). Fortfahren?')) return;
            DB.importAll(text);
            alert('Backup erfolgreich eingespielt.');
            renderDashboard();
            renderClasses();
            renderGrading();
        } catch (err) {
            alert('Ungültige Backup-Datei: ' + err.message);
        }
    };
    input.click();
};

function openNewSchoolYearModal() {
    const classes = DB.getSortedClasses();
    if (!classes.length) {
        showModal('<div class="modal-header"><h2>Neues Schuljahr starten</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div><p>Keine Klassen vorhanden.</p>');
        return;
    }
    const classListHtml = classes.map(cls =>
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:8px;background:var(--bg-dark);border-radius:8px;">' +
        '<input type="checkbox" id="sy-class-' + cls.id + '" checked style="accent-color:var(--primary);">' +
        '<span style="flex:1;font-weight:500;">' + escapeHtml(cls.name) + ' <small style="color:var(--text-muted);">' + escapeHtml(cls.subject) + '</small></span>' +
        '<input type="text" id="sy-new-name-' + cls.id + '" placeholder="Neuer Name (z.B. 5A)" style="width:140px;padding:6px;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:6px;color:var(--text-color);">' +
        '</div>'
    ).join('');
    const html = '<div class="modal-header">' +
        '<h2>Neues Schuljahr starten</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<p>Damit Sie das aktuelle Jahr nicht verlieren, empfehle ich zuerst:<br><strong>📁 Schuljahr sichern</strong>.</p>' +
        '<div class="form-group exam-form">' +
        '<h3>Klassen auswählen und umbenennen</h3>' +
        '<p class="subtitle" style="font-size:12px;">Markieren Sie Klassen, die Sie ins nächste Schuljahr übernehmen möchten. Optional können Sie einen neuen Namen eingeben (z.B. 4A → 5A).</p>' +
        classListHtml +
        '<label style="display:flex;align-items:center;gap:6px;margin-top:12px;width:auto;"><input type="checkbox" id="archive-school-year"> Aktuelles Jahr vorher archivieren</label>' +
        '<label style="display:flex;align-items:center;gap:6px;margin-top:6px;width:auto;"><input type="checkbox" id="clear-timetable" checked> Stundenplan leeren</label>' +
        '<label style="display:flex;align-items:center;gap:6px;margin-top:6px;width:auto;"><input type="checkbox" id="clear-grades" checked> Noten und Prüfungen löschen</label>' +
        '</div>' +
        '<div style="display:flex; gap:10px; justify-content:flex-end; margin-top:15px;">' +
        '<button class="btn btn-secondary" onclick="hideModal()">Abbrechen</button>' +
        '<button class="btn" onclick="executeSchoolYearChange()">Neues Schuljahr starten</button>' +
        '</div>';
    showModal(html);
}

function executeSchoolYearChange() {
    const classes = DB.loadClasses();
    const toKeep = [];
    const toDelete = [];
    classes.forEach(cls => {
        const cb = document.getElementById('sy-class-' + cls.id);
        if (cb && cb.checked) {
            const newNameInput = document.getElementById('sy-new-name-' + cls.id);
            const newName = newNameInput ? newNameInput.value.trim() : '';
            toKeep.push({ id: cls.id, newName: newName });
        } else {
            toDelete.push(cls.id);
        }
    });
    if (toKeep.length === 0) {
        alert('Bitte mindestens eine Klasse auswählen.');
        return;
    }
    if (!confirm('Wirklich das Schuljahr wechseln? Nicht ausgewählte Klassen werden gelöscht.')) return;
    const archive = document.getElementById('archive-school-year') && document.getElementById('archive-school-year').checked;
    const clearTimetable = document.getElementById('clear-timetable') && document.getElementById('clear-timetable').checked;
    const clearGrades = document.getElementById('clear-grades') && document.getElementById('clear-grades').checked;
    if (archive) {
        backupSchoolYear();
    }
    toDelete.forEach(id => {
        DB.deleteClass(id);
    });
    const remainingClasses = classes.filter(c => !toDelete.includes(c.id));
    remainingClasses.forEach(cls => {
        const keep = toKeep.find(k => k.id === cls.id);
        if (keep && keep.newName) {
            cls.name = keep.newName;
        }
    });
    DB.saveClasses(remainingClasses);
    if (clearTimetable) {
        DB.saveTimetable([]);
    }
    if (clearGrades) {
        remainingClasses.forEach(cls => {
            DB.saveExams(cls.id, []);
            DB.saveTeachingPlan(cls.id, []);
            DB.saveHwStatus(cls.id, {});
            DB.saveHwCorrected(cls.id, {});
            DB.saveHwExpired(cls.id, {});
            DB.saveMitarbeit(cls.id, {});
            DB.saveManualGrades(cls.id, {});
            DB.saveSemesterManualGrades(cls.id, {});
            DB.saveWorksheets(cls.id, []);
            DB.saveWorksheetStatus(cls.id, {});
            DB.saveAttendance(cls.id, []);
            DB.savePortfolioGrades(cls.id, {});
            DB.saveProjectGrades(cls.id, {});
            DB.saveProjects(cls.id, []);
            DB.savePruefungen(cls.id, []);
            DB.savePruefung(cls.id, {});
        });
    }
    hideModal();
    switchView('dashboard');
    renderDashboard();
    renderClasses();
    alert('Neues Schuljahr gestartet.');
}

function importData(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            DB.importAll(e.target.result);
            hideModal();
            switchView('dashboard');
            renderDashboard();
            renderClasses();
            alert('Daten erfolgreich importiert.');
        } catch (err) {
            alert('Import fehlgeschlagen: Datei ist kein gültiges Plan-it-Backup.');
        }
        input.value = '';
    };
    reader.readAsText(file);
}

function loadTimeSlotsTable() {
    renderHolidays();
    const days = DB.loadAutonomousDays();
    document.getElementById('autonomous-days').value = days.join(', ');
    const cb = document.getElementById('show-fruehaufsicht');
    if (cb) cb.checked = DB.loadShowFruehaufsicht();
    const endInput = document.getElementById('timetable-end-time');
    if (endInput) endInput.value = DB.loadTimetableEndTime();
    const hideHol = document.getElementById('hide-holiday-columns');
    if (hideHol) hideHol.checked = DB.loadHideHolidayColumns();
    const thresholds = DB.loadHwGradeThresholds();
    const g1 = document.getElementById('hw-threshold-g1');
    const g2 = document.getElementById('hw-threshold-g2');
    const g3 = document.getElementById('hw-threshold-g3');
    const g4 = document.getElementById('hw-threshold-g4');
    if (g1) g1.value = thresholds.g1;
    if (g2) g2.value = thresholds.g2;
    if (g3) g3.value = thresholds.g3;
    if (g4) g4.value = thresholds.g4;
    const globalSettings = DB.loadGlobalSettings();
    const startInput = document.getElementById('school-year-start');
    const endInput2 = document.getElementById('school-year-end');
    if (startInput) startInput.value = globalSettings.schoolYearStart || '';
    if (endInput2) endInput2.value = globalSettings.schoolYearEnd || '';
}

window.openTimetableEditor = openTimetableEditor;
window.openTimetableEditorFromCell = function(day, period) {
    openTimetableEditor(day, period);
};
window.openAppointmentModal = function(date) {
    const html = '<div class="modal-header"><h2>Termin hinzufügen</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<div class="form-group exam-form">' +
        '<label>Datum</label><input type="date" id="appt-date" value="' + (date || '') + '">' +
        '<label>Titel</label><input type="text" id="appt-title" placeholder="z.B. Elternabend">' +
        '<label>Beschreibung (optional)</label><input type="text" id="appt-desc" placeholder="z.B. 18:00, Aula">' +
        '<button class="btn" onclick="saveAppointment()">Speichern</button>' +
        '</div>' +
        '<h3 style="margin-top:15px;">Termine</h3>' +
        '<div id="appointments-list"></div>';
    showModal(html);
    renderAppointmentsList();
};
window.saveAppointment = function() {
    captureUndo();
    const date = document.getElementById('appt-date').value;
    const title = document.getElementById('appt-title').value.trim();
    const desc = document.getElementById('appt-desc').value.trim();
    if (!date || !title) { alert('Bitte Datum und Titel angeben.'); return; }
    DB.addAppointment({ date: date, title: title, description: desc });
    document.getElementById('appt-title').value = '';
    document.getElementById('appt-desc').value = '';
    renderAppointmentsList();
    renderDashboard();
};
window.editAppointment = function(id) {
    const appt = DB.loadAppointments().find(a => a.id === id);
    if (!appt) return;
    showModal('<div class="modal-header"><h2>Termin bearbeiten</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<div class="form-group exam-form">' +
        '<label>Datum</label><input type="date" id="edit-appt-date" value="' + appt.date + '">' +
        '<label>Titel</label><input type="text" id="edit-appt-title" value="' + escapeHtml(appt.title || '') + '">' +
        '<label>Beschreibung (optional)</label><input type="text" id="edit-appt-desc" value="' + escapeHtml(appt.description || '') + '">' +
        '<button class="btn" onclick="updateAppointment(\'' + id + '\')">Speichern</button>' +
        '<button class="btn btn-secondary" onclick="deleteAppointment(\'' + id + '\')">Löschen</button>' +
        '</div>');
};
window.updateAppointment = function(id) {
    captureUndo();
    const date = document.getElementById('edit-appt-date').value;
    const title = document.getElementById('edit-appt-title').value.trim();
    const desc = document.getElementById('edit-appt-desc').value.trim();
    if (!date || !title) { alert('Bitte Datum und Titel angeben.'); return; }
    DB.updateAppointment(id, { date: date, title: title, description: desc });
    hideModal();
    renderAppointmentsList();
    renderDashboard();
};
window.deleteAppointment = function(id) {
    if (!confirm('Termin wirklich löschen?')) return;
    captureUndo();
    DB.deleteAppointment(id);
    hideModal();
    renderAppointmentsList();
    renderDashboard();
};
function renderAppointmentsList() {
    const list = DB.loadAppointments() || [];
    const container = document.getElementById('appointments-list');
    if (!container) return;
    if (!list.length) { container.innerHTML = '<p class="subtitle" style="font-size:12px;">Keine Termine eingetragen.</p>'; return; }
    let html = '<table class="settings-table" style="width:100%;"><thead><tr><th>Datum</th><th>Titel</th><th>Beschreibung</th><th></th></tr></thead><tbody>';
    list.sort((a, b) => a.date.localeCompare(b.date)).forEach(a => {
        html += '<tr><td>' + formatDateDE(a.date) + '</td><td>' + escapeHtml(a.title || '') + '</td><td>' + escapeHtml(a.description || '') + '</td>' +
            '<td><button class="btn btn-secondary" onclick="editAppointment(\'' + a.id + '\')">Bearbeiten</button></td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}
window.openClassManager = openClassManager;
window.editStudent = editStudent;
window.saveStudentEdit = saveStudentEdit;
window.openExamManagerFromSelect = openExamManagerFromSelect;
window.openClassGrading = openClassGrading;
window.addTimeSlot = addTimeSlot;
window.saveTimeSettings = saveTimeSettings;
window.saveAutonomousDays = saveAutonomousDays;
window.exportData = exportData;
window.backupSchoolYear = backupSchoolYear;
window.openNewSchoolYearModal = openNewSchoolYearModal;
window.executeSchoolYearChange = executeSchoolYearChange;
window.importData = importData;
window.linkDataFile = linkDataFile;
window.addManualHoliday = addManualHoliday;
window.addTimetableEntryModal = addTimetableEntryModal;
window.deleteTimetableEntry = deleteTimetableEntry;
window.updateTimetableEntry = updateTimetableEntry;
window.editTimetableEntry = editTimetableEntry;
window.saveExam = saveExam;
window.deleteExamConfirm = deleteExamConfirm;
window.setCurrentExam = setCurrentExam;
window.printExam = printExam;
window.deleteStudent = deleteStudent;
window.setHwStatus = setHwStatus;
window.setHwCollected = setHwCollected;
window.showMissingHwModal = showMissingHwModal;
window.toggleHwExpired = toggleHwExpired;
window.toggleHwCorrected = toggleHwCorrected;
window.toggleSupplier = function(btn) {
    const isActive = btn.getAttribute('data-supplier') === '1';
    const newState = isActive ? '0' : '1';
    btn.setAttribute('data-supplier', newState);
    btn.textContent = newState === '1' ? 'Supplierstunde (aktiv)' : 'Supplierstunde';
};
window.setHwView = setHwView;
window.setGradeTab = setGradeTab;
window.openExamModal = openExamModal;
window.addExamExampleRow = addExamExampleRow;
window.hideModal = hideModal;
window.showModal = showModal;
window.saveHwGradeThresholds = function() {
    captureUndo();
    const g1 = parseInt(document.getElementById('hw-threshold-g1').value, 10);
    const g2 = parseInt(document.getElementById('hw-threshold-g2').value, 10);
    const g3 = parseInt(document.getElementById('hw-threshold-g3').value, 10);
    const g4 = parseInt(document.getElementById('hw-threshold-g4').value, 10);
    DB.saveHwGradeThresholds({ g1: g1, g2: g2, g3: g3, g4: g4 });
    alert('Notengrenzen gespeichert.');
};
window.saveGlobalSettings = function() {
    captureUndo();
    const start = document.getElementById('school-year-start').value;
    const end = document.getElementById('school-year-end').value;
    DB.saveGlobalSettings({ schoolYearStart: start, schoolYearEnd: end });
    alert('Schuljahr gespeichert.');
};
function setSyncStatus(text) {
    const el = document.getElementById('sync-status');
    if (el) {
        el.textContent = text || '--';
        el.className = 'sync-status';
    }
}

function setODStatus(connected) {
    const el = document.getElementById('sync-status');
    if (el) {
        el.className = 'sync-status ' + (connected ? 'od-connected' : 'od-disconnected');
        el.textContent = connected ? 'OneDrive: verbunden' : 'OneDrive: nicht verbunden';
    }
}

window.syncNow = async function() {
    if (!(FilePersist && FilePersist.saveToFile && FilePersist.loadFromFile)) {
        setSyncStatus('nicht verknüpft');
        alert('Keine Datei-Speicherung verknüpft.');
        return;
    }
    if (!validateAllGrades()) {
        alert('Bitte korrigieren Sie die ungültigen Noten (rot markiert) vor dem Speichern.');
        return;
    }
    showLoading('Sync läuft...');
    setSyncStatus('Sync läuft...');
    try {
        await FilePersist.loadFromFile();
        await FilePersist.saveToFile();
        setSyncStatus('gespeichert');
        alert('Sync abgeschlossen.');
    } catch (e) {
        setSyncStatus('Fehler');
        alert('Sync fehlgeschlagen: ' + (e && e.message ? e.message : e));
    }
    hideLoading();
};

window.manualSave = async function() {
    if (FilePersist && FilePersist.saveToFile) {
        if (!validateAllGrades()) {
            alert('Bitte korrigieren Sie die ungültigen Noten (rot markiert) vor dem Speichern.');
            return;
        }
        showLoading('Speichert...');
        setSyncStatus('speichert...');
        await FilePersist.saveToFile();
        setSyncStatus('gespeichert');
        hideLoading();
    }
};

async function linkDataFile() {
    const ok = await FilePersist.chooseFile();
    updateDataFileUI();
    if (ok) { alert('Datendatei verknüpft. Alle Änderungen werden jetzt automatisch gespeichert.'); renderDashboard(); renderClasses(); }
}

function updateDataFileUI() {
    const el = document.getElementById('datafile-status');
    if (!el) return;
    el.textContent = '💾 Automatische Speicherung aktiv – planit-daten.json wird alle 30 Sekunden gespeichert und von OneDrive synchronisiert.';
}

window.ODSaveConfig = function () {
    const cid = document.getElementById('od-clientid');
    const ten = document.getElementById('od-tenant');
    if (window.OD) window.OD.setConfig(cid ? cid.value : '', ten ? ten.value : '');
    if (window.OD) window.OD.renderStatus();
    alert('Konfiguration gespeichert. Jetzt auf „Mit OneDrive verbinden" klicken.');
};

window.ODConnect = function () {
    if (window.OD) window.OD.connect();
};

window.ODUseCloud = function () {
    if (window.OD) window.OD.useCloud();
};

window.ODDisconnect = function () {
    if (window.OD) window.OD.disconnect();
};

function renderODConfig() {
    const cid = document.getElementById('od-clientid');
    const ten = document.getElementById('od-tenant');
    if (cid && window.OD && window.OD.getClientId) cid.value = window.OD.getClientId();
    if (ten && window.OD && window.OD.getTenant) ten.value = window.OD.getTenant();
    if (window.OD) window.OD.renderStatus();
}

/* ============ GZ / DG ERWEITERUNGEN ============ */
function isDGClass(classId) {
    const cls = DB.loadClasses().find(c => c.id === classId);
    return cls && cls.type === 'dg';
}

function isGZClass(classId) {
    const cls = DB.loadClasses().find(c => c.id === classId);
    return cls && cls.type === 'gz';
}

function getDGHwSheetValue(cell, sheetName) {
    if (!cell) return '';
    if (!sheetName) return typeof cell.status === 'string' ? cell.status : '';
    if (typeof cell.status === 'object' && cell.status !== null) return cell.status[sheetName] || '';
    return '';
}

function getDGHwCellStatus(cell, sheetNames) {
    if (!sheetNames || sheetNames.length === 0) {
        const val = cell ? (typeof cell.status === 'string' ? cell.status : '') : '';
        return { value: val, missing: val === '' || val === '0' || val === 'forgotten', sick: val === 'k' };
    }
    if (!cell || typeof cell.status !== 'object') return { value: '', missing: true, sick: false };
    let anyEmpty = false;
    let allK = true;
    sheetNames.forEach(name => {
        const val = cell.status[name] || '';
        if (val === 'k') {
            // keep allK true
        } else if (val === '' || val === '0' || val === 'forgotten') {
            anyEmpty = true;
            allK = false;
        } else {
            allK = false;
        }
    });
    return { value: '', missing: anyEmpty, sick: allK };
}

window.setHwSheetStatus = function(classId, studentId, hwNr, sheetName, value) {
    captureUndo();
    const all = DB.loadHwStatus(classId);
    if (!all[studentId]) all[studentId] = {};
    if (!all[studentId][hwNr]) all[studentId][hwNr] = {};
    const cell = all[studentId][hwNr];
    if (!sheetName) {
        cell.status = value;
    } else {
        if (typeof cell.status !== 'object' || cell.status === null) cell.status = {};
        cell.status[sheetName] = value;
    }
    DB.saveHwStatus(classId, all);
    renderGrading();
};

/* GZ Funktionen */
function isHoliday(dateStr) {
    const holidays = DB.loadHolidays() || [];
    const autonomous = DB.loadAutonomousDays() || [];
    const allDates = holidays.map(h => h.date).concat(autonomous);
    return allDates.indexOf(dateStr) !== -1;
}

function getHolidayName(dateStr) {
    const holidays = DB.loadHolidays() || [];
    const h = holidays.find(h => h.date === dateStr);
    return h ? (h.localName || h.name) : '';
}

function getGZPlannedWorksheets(classId) {
    const cls = DB.loadClasses().find(c => c.id === classId);
    const firstLessonDate = cls && cls.firstLessonDate ? cls.firstLessonDate : null;
    const globalSettings = DB.loadGlobalSettings();
    const schoolYearStart = globalSettings.schoolYearStart || '';
    const schoolYearEnd = globalSettings.schoolYearEnd || '';
    const computerOnly = (globalSettings.computerWorksheets && globalSettings.computerWorksheets[classId]) || [];
    if (!schoolYearStart || !schoolYearEnd || !firstLessonDate) return [];
    const startDate = firstLessonDate;
    const regularDates = [];
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);
    const end = new Date(schoolYearEnd);
    end.setHours(23, 59, 59, 999);
    while (d <= end) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        regularDates.push(y + '-' + m + '-' + day);
        d.setDate(d.getDate() + 7);
    }
    const plan = sortedPlan(classId);
    const supplierDates = plan.filter(e => e.supplier && e.date).map(e => e.date);
    const allDates = regularDates.concat(supplierDates);
    const worksheetEntries = plan.filter(e => e.homeworkNr);
    const seen = new Set();
    const result = [];
    allDates.forEach(date => {
        const entry = worksheetEntries.find(e => e.date === date);
        if (entry && !seen.has(entry.homeworkNr)) {
            seen.add(entry.homeworkNr);
            const nr = parseInt(entry.homeworkNr, 10);
            result.push({ nr: nr, title: entry.homeworkContent || '', date: entry.date, isComputerOnly: computerOnly.indexOf(nr) !== -1 });
        }
    });
    return result;
}

function renderGZWorksheets(classId) {
    const planned = getGZPlannedWorksheets(classId);
    const cls = DB.loadClasses().find(c => c.id === classId);
    const className = cls ? cls.name : '';
    const globalSettings = DB.loadGlobalSettings();
    const computerOnly = (globalSettings.computerWorksheets && globalSettings.computerWorksheets[classId]) || [];
    let html = '<div class="view-header print-keep"><div><h2>Liste der ÜB – ' + escapeHtml(className) + '</h2></div>' +
        '<button class="btn btn-secondary" onclick="window.exportWorksheetsCSV(\'' + classId + '\')">📊 Als CSV exportieren</button></div>';
    if (!planned.length) {
        html += '<p class="subtitle">Noch keine Übungsblätter in der Stundenplanung vorhanden.</p>';
        return html;
    }
    html += '<table class="grading-table"><thead><tr><th>Nr.</th><th>Titel</th><th>Datum</th><th>Nur Computer</th></tr></thead><tbody>';
    planned.forEach(w => {
        const isComputer = computerOnly.indexOf(w.nr) !== -1;
        const rowStyle = isComputer ? 'style="color:#16a34a;font-style:italic;"' : '';
        const toggleLabel = isComputer ? 'Als Mappe markieren' : 'Als Nur-Computer markieren';
        html += '<tr ' + rowStyle + '><td>' + w.nr + '</td><td>' + escapeHtml(w.title || '') + '</td><td>' + formatDateDE(w.date || '') + '</td>' +
            '<td style="text-align:center;"><button class="btn btn-secondary" onclick="toggleComputerOnly(\'' + classId + '\',' + w.nr + ')">' + toggleLabel + '</button></td></tr>';
    });
    html += '</tbody></table>';
    return html;
}

window.toggleComputerOnly = function(classId, worksheetNr) {
    const globalSettings = DB.loadGlobalSettings();
    const computerOnly = (globalSettings.computerWorksheets && globalSettings.computerWorksheets[classId]) || [];
    const idx = computerOnly.indexOf(worksheetNr);
    if (idx >= 0) computerOnly.splice(idx, 1);
    else computerOnly.push(worksheetNr);
    globalSettings.computerWorksheets = globalSettings.computerWorksheets || {};
    globalSettings.computerWorksheets[classId] = computerOnly;
    DB.saveGlobalSettings(globalSettings);
    renderGrading();
};

window.exportWorksheetsCSV = function(classId) {
    const planned = getGZPlannedWorksheets(classId);
    const cls = DB.loadClasses().find(c => c.id === classId);
    const className = cls ? cls.name : 'Klasse';
    const globalSettings = DB.loadGlobalSettings();
    const computerOnly = (globalSettings.computerWorksheets && globalSettings.computerWorksheets[classId]) || [];
    if (!planned.length) {
        alert('Keine Übungsblätter zum Exportieren vorhanden.');
        return;
    }
    const lines = ['Nr.;Titel;Datum;Nur Computer'];
    planned.forEach(w => {
        const title = (w.title || '').replace(/"/g, '""');
        const date = formatDateDE(w.date || '');
        const isComputer = computerOnly.indexOf(w.nr) !== -1;
        lines.push('"' + w.nr + '";"' + title + '";"' + date + '";' + (isComputer ? 'Ja' : 'Nein'));
    });
    const csv = lines.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uebungsliste_' + className.replace(/[^a-zA-Z0-9_-]/g, '_') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

function renderGZGrades(classId) {
    normalizeGZForgotten(classId);
    const students = DB.getStudentsForClass(classId);
    const worksheets = getGZPlannedWorksheets(classId);
    const status = DB.loadWorksheetStatus(classId);
    const weights = DB.loadGZGradeWeights(classId);
    let html = '<div class="view-header"><div><h2>ÜB Noten</h2><p class="subtitle">k = bei Ausgabe nicht anwesend (gelb) · Blatt: x = nicht bekommen (rot), ng = nachgebracht (grün) · Mat/Lap = Material/Laptop bei dieser Stunde vergessen.</p></div></div>';
    if (!students.length) {
        html += '<p class="subtitle">Keine Schüler in dieser Klasse.</p>';
        return html;
    }
    html += '<div class="hw-grid-wrap"><table class="grading-table" id="gz-grades-table"><thead><tr><th rowspan="2" class="hw-sticky-left">Schüler</th>';
    worksheets.forEach(w => {
        const co = w.isComputerOnly ? ' <small style="color:#16a34a;font-style:italic;">(nur Computer)</small>' : '';
        const toggleBtn = '<button class="btn btn-secondary" style="font-size:11px;padding:3px 8px;min-width:80px;" onclick="toggleComputerOnly(\'' + classId + '\',' + w.nr + ')">' + (w.isComputerOnly ? '✓ Nur Computer' : '○ Ausgeteilt') + '</button>';
        html += '<th colspan="4" class="gz-ws-sep">' + w.nr + toggleBtn + '<br><small>' + escapeHtml(w.title || '') + '</small><br><small>' + formatDateDE(w.date || '') + '</small>' + co + '</th>';
    });
    html += '<th rowspan="2" class="gz-ws-sep">Ø ÜB</th><th rowspan="2" class="hw-sticky-right-last">Fehlend</th></tr><tr>';
    worksheets.forEach(w => {
        html += '<th class="gz-ws-sep">Note</th><th>k</th><th>Abg</th><th class="gz-ws-last">Verg.</th>';
    });
    html += '</tr></thead><tbody>';
    students.forEach(s => {
        const st = status[s.id] || {};
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>';
        let sum = 0, count = 0, missingCount = 0;
        const missingList = [];
        worksheets.forEach(w => {
            const cell = st[w.nr] || {};
            const grade = cell.grade || '';
            const absent = !!cell.absent;
            const received = cell.received || '';
            if (grade === '' || grade === 'missing') {
                missingCount++;
                missingList.push(w.nr);
            }
            if (grade && grade !== 'missing') { sum += parseFloat(grade); count++; }
            const matOn = gzForgottenHas(classId, w.date, s.id, 'material');
            const lapOn = gzForgottenHas(classId, w.date, s.id, 'laptop');
            const recvLabel = received === 'x' ? 'x' : (received === 'ng' ? 'ng' : '');
            const recvClass = received === 'x' ? 'gz-recv-x' : (received === 'ng' ? 'gz-recv-ng' : '');
            const forgotLabel = matOn ? 'Mat' : (lapOn ? 'Lap' : '');
            const forgotClass = (matOn || lapOn) ? 'gz-mat active' : '';
            const gradeSelectClass = grade ? ' gz-grade-' + grade : '';
            const computerClass = w.isComputerOnly ? ' gz-computer-only' : '';
            html += '<td class="gz-ws-sep' + computerClass + '"><select class="gz-grade-select' + gradeSelectClass + '" onchange="setGZWorksheetGrade(\'' + classId + '\',\'' + s.id + '\',' + w.nr + ',this.value)">' +
                '<option value="">–</option>' +
                [1,2,3,4,5].map(g => '<option value="' + g + '"' + (grade == g ? ' selected' : '') + '>' + g + '</option>').join('') +
                '<option value="seen"' + (grade === 'seen' ? ' selected' : '') + '>nur gesehen</option>' +
                '</select></td>';
            html += '<td class="' + computerClass + '" style="text-align:center;"><button class="gz-toggle gz-k' + (absent ? ' active' : '') + '" title="bei Ausgabe nicht anwesend" onclick="setGZAbsent(\'' + classId + '\',\'' + s.id + '\',' + w.nr + ',' + (!absent) + ')">k</button></td>';
            html += '<td class="' + computerClass + '" style="text-align:center;"><button class="gz-toggle ' + recvClass + '" title="Abgabe: leer=abgegeben, x=nicht abgegeben, ng=nachgebracht" onclick="setGZReceived(\'' + classId + '\',\'' + s.id + '\',' + w.nr + ')">' + recvLabel + '</button></td>';
            html += '<td class="gz-ws-last ' + computerClass + '" style="text-align:center;"><button class="gz-toggle ' + forgotClass + '" title="Vergessen: leer=nichts, Mat=Material, Lap=Laptop" onclick="cycleGZForgotten(\'' + classId + '\',\'' + w.date + '\',\'' + s.id + '\')">' + forgotLabel + '</button></td>';
        });
        const avg = count > 0 ? (sum / count).toFixed(2) : '–';
        const missingJson = JSON.stringify(missingList).replace(/"/g, '&quot;');
        html += '<td class="gz-ws-sep">' + avg + '</td>' +
            '<td class="hw-sticky-right-last"><button class="btn btn-secondary" onclick="showMissingWorksheetsModal(\'' + classId + '\',\'' + s.id + '\',' + missingCount + ',\'' + missingJson + '\')">' + missingCount + '</button></td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
}

function calcGZGrade(studentId, classId, weights, includeProject) {
    const status = DB.loadWorksheetStatus(classId);
    const st = status[studentId] || {};
    const worksheets = DB.loadWorksheets(classId);
    let sum = 0, totalWeight = 0;
    if (weights.worksheets && worksheets.length) {
        let wsSum = 0, wsCount = 0;
        worksheets.forEach(w => {
            const g = st[w.nr] ? parseFloat(st[w.nr].grade) : NaN;
            if (!isNaN(g)) { wsSum += g; wsCount++; }
        });
        if (wsCount > 0) { sum += (wsSum / wsCount) * weights.worksheets; totalWeight += weights.worksheets; }
    }
    if (weights.portfolio && st.portfolio) { sum += parseFloat(st.portfolio) * weights.portfolio; totalWeight += weights.portfolio; }
    if (weights.attendance && st.attendance) { sum += parseFloat(st.attendance) * weights.attendance; totalWeight += weights.attendance; }
    if (includeProject && weights.project && st.project) { sum += parseFloat(st.project) * weights.project; totalWeight += weights.project; }
    if (totalWeight === 0) return null;
    return sum / totalWeight;
}

window.setGZWorksheetGrade = function(classId, studentId, wsNr, value) {
    captureUndo();
    const all = DB.loadWorksheetStatus(classId);
    if (!all[studentId]) all[studentId] = {};
    if (!all[studentId][wsNr]) all[studentId][wsNr] = {};
    all[studentId][wsNr].grade = value === '' ? '' : value;
    DB.saveWorksheetStatus(classId, all);
    renderGrading();
};

window.setGZAbsent = function(classId, studentId, wsNr, value) {
    captureUndo();
    const all = DB.loadWorksheetStatus(classId);
    if (!all[studentId]) all[studentId] = {};
    if (!all[studentId][wsNr]) all[studentId][wsNr] = {};
    all[studentId][wsNr].absent = value ? true : false;
    DB.saveWorksheetStatus(classId, all);
    renderGrading();
};

window.setGZReceived = function(classId, studentId, wsNr) {
    captureUndo();
    const all = DB.loadWorksheetStatus(classId);
    if (!all[studentId]) all[studentId] = {};
    if (!all[studentId][wsNr]) all[studentId][wsNr] = {};
    const cur = all[studentId][wsNr].received || '';
    all[studentId][wsNr].received = cur === '' ? 'x' : (cur === 'x' ? 'ng' : '');
    DB.saveWorksheetStatus(classId, all);
    renderGrading();
};

window.setGZPortfolioGrade = function(classId, studentId, value) {
    captureUndo();
    const all = DB.loadWorksheetStatus(classId);
    if (!all[studentId]) all[studentId] = {};
    all[studentId].portfolio = value === '' ? '' : value;
    DB.saveWorksheetStatus(classId, all);
    renderGrading();
};

window.setGZAttendanceGrade = function(classId, studentId, value) {
    captureUndo();
    const all = DB.loadWorksheetStatus(classId);
    if (!all[studentId]) all[studentId] = {};
    all[studentId].attendance = value === '' ? '' : value;
    DB.saveWorksheetStatus(classId, all);
    renderGrading();
};

window.setGZProjectGrade = function(classId, studentId, value, field) {
    captureUndo();
    const all = DB.loadWorksheetStatus(classId);
    if (!all[studentId]) all[studentId] = {};
    if (field === 'note') all[studentId].projectNote = value;
    else all[studentId].project = value === '' ? '' : value;
    DB.saveWorksheetStatus(classId, all);
    renderGrading();
};

function renderGZProject(classId) {
    const students = DB.getStudentsForClass(classId);
    const status = DB.loadWorksheetStatus(classId);
    let html = '<div class="view-header"><div><h2>Projekt</h2><p class="subtitle">Projektnote und Bemerkung pro Schüler.</p></div></div>';
    if (!students.length) {
        html += '<p class="subtitle">Keine Schüler in dieser Klasse.</p>';
        return html;
    }
    html += '<table class="grading-table"><thead><tr><th>Schüler</th><th>Note</th><th>Rechtzeitig abgegeben</th><th>Bemerkung</th></tr></thead><tbody>';
    students.forEach(s => {
        const st = status[s.id] || {};
        const grade = st.project || '';
        const note = st.projectNote || '';
        const ot = st.projectOnTime || '';
        const otLabel = ot === 'pos' ? '✓' : (ot === 'neg' ? '✗' : '');
        const otClass = ot === 'pos' ? 'gz-recv-ng' : (ot === 'neg' ? 'gz-recv-x' : '');
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>' +
            '<td>' + gradeSelect(grade, "setGZProjectGrade('" + classId + "','" + s.id + "',this.value)") + '</td>' +
            '<td style="text-align:center;"><button class="gz-toggle ' + otClass + '" title="Rechtzeitig abgegeben: ✓=ja, ✗=nein" onclick="toggleGZProjectOnTime(\'' + classId + '\',\'' + s.id + '\')">' + otLabel + '</button></td>' +
            '<td><input type="text" class="grade-input" style="width:auto;min-width:200px;" value="' + escapeHtml(note) + '" onchange="setGZProjectGrade(\'' + classId + '\',\'' + s.id + '\',this.value,\'note\')"></td></tr>';
    });
    html += '</tbody></table>';
    return html;
}

window.toggleGZProjectOnTime = function(classId, studentId) {
    captureUndo();
    const all = DB.loadWorksheetStatus(classId);
    if (!all[studentId]) all[studentId] = {};
    const cur = all[studentId].projectOnTime || '';
    all[studentId].projectOnTime = cur === '' ? 'pos' : (cur === 'pos' ? 'neg' : '');
    DB.saveWorksheetStatus(classId, all);
    renderGrading();
};

window.setGZManualGrade = function(classId, studentId, value) {
    const all = DB.loadWorksheetStatus(classId);
    if (!all[studentId]) all[studentId] = {};
    all[studentId].manual = value === '' ? '' : value;
    DB.saveWorksheetStatus(classId, all);
    renderGrading();
};

window.openGZWeightsModal = function(classId) {
    const weights = DB.loadGZGradeWeights(classId);
    showModal(
        '<div class="modal-header"><h2>Gewichtung GZ</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>' +
        '<div class="form-group exam-form">' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
        '<label style="margin:0;">Übungsblätter <input type="number" step="0.05" id="gz-w-worksheets" class="grade-input" style="width:60px;" value="' + (weights.worksheets || 0) + '"></label>' +
        '<label style="margin:0;">Mappe <input type="number" step="0.05" id="gz-w-portfolio" class="grade-input" style="width:60px;" value="' + (weights.portfolio || 0) + '"></label>' +
        '<label style="margin:0;">Mitarbeit <input type="number" step="0.05" id="gz-w-attendance" class="grade-input" style="width:60px;" value="' + (weights.attendance || 0) + '"></label>' +
        '<label style="margin:0;">Projekt <input type="number" step="0.05" id="gz-w-project" class="grade-input" style="width:60px;" value="' + (weights.project || 0) + '"></label>' +
        '</div>' +
        '<button class="btn" onclick="saveGZWeights(\'' + classId + '\')" style="margin-top:10px;">Speichern</button>' +
        '</div>'
    );
};

window.saveGZWeights = function(classId) {
    captureUndo();
    const weights = {
        worksheets: parseFloat(document.getElementById('gz-w-worksheets').value) || 0,
        portfolio: parseFloat(document.getElementById('gz-w-portfolio').value) || 0,
        attendance: parseFloat(document.getElementById('gz-w-attendance').value) || 0,
        project: parseFloat(document.getElementById('gz-w-project').value) || 0
    };
    DB.saveGZGradeWeights(classId, weights);
    hideModal();
    renderGrading();
};

window.showMissingWorksheetsModal = function(classId, studentId, missingCount, missingJson) {
    const student = DB.loadStudents().find(s => s.id === studentId);
    const name = student ? escapeHtml(student.name) : 'Schüler';
    let html = '<div class="modal-header"><h2>Fehlende Übungsblätter – ' + name + '</h2><button class="btn btn-secondary" onclick="hideModal()">×</button></div>';
    html += '<div class="form-group exam-form">';
    if (!missingCount) {
        html += '<p>Keine fehlenden Übungsblätter.</p>';
    } else {
        const missingList = JSON.parse(missingJson);
        html += '<p><strong>Anzahl: ' + missingCount + '</strong></p>';
        html += '<ul style="list-style:disc;padding-left:20px;">';
        missingList.forEach(nr => {
            html += '<li>Übungsblatt ' + nr + '</li>';
        });
        html += '</ul>';
    }
    html += '</div>';
    showModal(html);
};

function getGZLessonDates(classId) {
    const cls = DB.loadClasses().find(c => c.id === classId);
    const firstLessonDate = cls && cls.firstLessonDate ? cls.firstLessonDate : null;
    const globalSettings = DB.loadGlobalSettings();
    const schoolYearStart = globalSettings.schoolYearStart || '';
    const schoolYearEnd = globalSettings.schoolYearEnd || '';
    if (!schoolYearStart || !schoolYearEnd || !firstLessonDate) return [];
    const plan = sortedPlan(classId);
    const supplierDates = plan.filter(e => e.supplier && e.date).map(e => e.date);
    const regularDates = [];
    const d = new Date(firstLessonDate);
    d.setHours(0, 0, 0, 0);
    const end = new Date(schoolYearEnd);
    end.setHours(23, 59, 59, 999);
    while (d <= end) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        regularDates.push(y + '-' + m + '-' + day);
        d.setDate(d.getDate() + 7);
    }
    const all = regularDates.concat(supplierDates);
    const seen = new Set();
    const result = [];
    all.forEach(date => { if (!seen.has(date)) { seen.add(date); result.push(date); } });
    result.sort();
    return result;
}

function getGZForgottenCounts(classId, studentId) {
    const data = DB.loadForgotMaterial(classId);
    // Nur an Übungsblatt-Tagen zählen (konsistent mit Tab "ÜB Noten")
    const wsDates = new Set(getGZPlannedWorksheets(classId).map(w => w.date));
    let material = 0, laptop = 0;
    Object.keys(data).forEach(date => {
        if (!wsDates.has(date)) return;
        const d = data[date];
        const inMat = d.material && d.material.indexOf(studentId) !== -1;
        const inLap = d.laptop && d.laptop.indexOf(studentId) !== -1;
        // Material und Laptop schließen sich aus: bei Widerspruch zählt Material
        if (inMat) material++;
        else if (inLap) laptop++;
    });
    return { material: material, laptop: laptop };
}

function normalizeGZForgotten(classId) {
    const data = DB.loadForgotMaterial(classId);
    let changed = false;
    Object.keys(data).forEach(date => {
        const d = data[date];
        if (!d.material || !d.laptop) return;
        for (let i = d.laptop.length - 1; i >= 0; i--) {
            if (d.material.indexOf(d.laptop[i]) !== -1) {
                d.laptop.splice(i, 1);
                changed = true;
            }
        }
    });
    if (changed) DB.saveForgotMaterial(classId, data);
}

function gzForgottenHas(classId, date, studentId, kind) {
    const data = DB.loadForgotMaterial(classId);
    const d = data[date];
    return !!(d && d[kind] && d[kind].indexOf(studentId) !== -1);
}

function renderGZForgotten(classId) {
    normalizeGZForgotten(classId);
    const students = DB.getStudentsForClass(classId);
    const worksheets = getGZPlannedWorksheets(classId);
    const wsDates = new Set(worksheets.map(w => w.date));
    const data = DB.loadForgotMaterial(classId);
    const studentMap = {};
    students.forEach(s => { studentMap[s.id] = s; });
    const studentEntries = {};
    Object.keys(data).forEach(date => {
        if (!wsDates.has(date)) return;
        const d = data[date];
        (d.material || []).forEach(sid => {
            if (!studentMap[sid]) return;
            if (!studentEntries[sid]) studentEntries[sid] = [];
            studentEntries[sid].push({ date, kind: 'material' });
        });
        (d.laptop || []).forEach(sid => {
            if (!studentMap[sid]) return;
            if (!studentEntries[sid]) studentEntries[sid] = [];
            studentEntries[sid].push({ date, kind: 'laptop' });
        });
    });
    Object.keys(studentEntries).forEach(sid => {
        studentEntries[sid].sort((a, b) => a.date.localeCompare(b.date));
    });
    const sortedStudents = students.filter(s => studentEntries[s.id]).sort((a, b) => (getLastName(a.name) || '').localeCompare(getLastName(b.name) || ''));
    let html = '<div class="view-header"><div><h2>Vergessenes Material</h2>' +
        '<p class="subtitle">Pro Schüler: welche Übungstage mit Material- oder Laptop-Vergessen.</p></div></div>';
    if (!sortedStudents.length) {
        html += '<p class="subtitle">Keine Einträge vorhanden.</p>';
        return html;
    }
    html += '<table class="grading-table"><thead><tr><th>Schüler</th><th>Vorkommnisse</th></tr></thead><tbody>';
    sortedStudents.forEach(s => {
        const entries = studentEntries[s.id] || [];
        const parts = entries.length + 'x: ' + entries.map(e => '<span class="gz-forgot-date">' + formatDateDE(e.date) + '</span> ' + (e.kind === 'material' ? 'Mat' : 'Lap')).join(', ');
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>' +
            '<td>' + parts + '</td></tr>';
    });
    html += '</tbody></table>';
    return html;
}

window.toggleGZForgotten = function(classId, date, studentId, kind, checked) {
    captureUndo();
    const data = DB.loadForgotMaterial(classId);
    if (!data[date]) data[date] = { material: [], laptop: [] };
    if (!data[date].material) data[date].material = [];
    if (!data[date].laptop) data[date].laptop = [];
    const other = kind === 'material' ? 'laptop' : 'material';
    const list = data[date][kind];
    const otherList = data[date][other];
    const idx = list.indexOf(studentId);
    if (checked) {
        if (idx === -1) list.push(studentId);
        // Material und Laptop schließen sich gegenseitig aus
        const oIdx = otherList.indexOf(studentId);
        if (oIdx !== -1) otherList.splice(oIdx, 1);
    } else {
        if (idx !== -1) list.splice(idx, 1);
    }
    DB.saveForgotMaterial(classId, data);
    renderGrading();
};

window.cycleGZForgotten = function(classId, date, studentId) {
    captureUndo();
    const data = DB.loadForgotMaterial(classId);
    if (!data[date]) data[date] = { material: [], laptop: [] };
    const mat = data[date].material || [];
    const lap = data[date].laptop || [];
    const hasMat = mat.indexOf(studentId) !== -1;
    const hasLap = lap.indexOf(studentId) !== -1;
    // remove from both first
    if (hasMat) mat.splice(mat.indexOf(studentId), 1);
    if (hasLap) lap.splice(lap.indexOf(studentId), 1);
    // cycle: none -> material -> laptop -> none
    if (!hasMat && !hasLap) { mat.push(studentId); }
    else if (hasMat) { lap.push(studentId); }
    // if hasLap -> stays removed (none)
    data[date].material = mat;
    data[date].laptop = lap;
    DB.saveForgotMaterial(classId, data);
    renderGrading();
};

window.renderGZForgotten = renderGZForgotten;

function renderGZOverview(classId) {
    normalizeGZForgotten(classId);
    const students = DB.getStudentsForClass(classId);
    const worksheets = getGZPlannedWorksheets(classId);
    const status = DB.loadWorksheetStatus(classId);
    const weights = DB.loadGZGradeWeights(classId);
    const manualGrades = DB.loadManualGrades(classId);
    const semesterManualGrades = DB.loadSemesterManualGrades(classId);
    const mitarbeit = DB.loadMitarbeit(classId);
    const project = DB.loadProjectGrades(classId);
    const remarks = DB.loadSemesterRemarks(classId);
    const isYear = gradeOverviewScope === 'year';
    const includeProject = isYear;
    let html = '<div class="view-header"><div><h2>Übersicht – ' + (isYear ? 'Ganzes Jahr' : '1. Semester') + '</h2>' +
        '<p class="subtitle">Gewichtung der Noten frei wählbar. Manuelle Note überschreibt die Berechnung.</p></div>' +
        '<div class="grading-controls">' +
        '<button class="btn ' + (isYear ? 'btn-secondary' : '') + '" onclick="setOverviewScope(\'semester\')">1. Semester</button>' +
        '<button class="btn ' + (isYear ? '' : 'btn-secondary') + '" onclick="setOverviewScope(\'year\')">Ganzes Jahr</button>' +
        '</div>' +
        '<button class="btn btn-secondary" onclick="window.openGZWeightsModal(\'' + classId + '\')">⚖️ Gewichtung</button></div>';
    if (!students.length) {
        html += '<p class="subtitle">Keine Schüler in dieser Klasse.</p>';
        return html;
    }
    html += '<div class="hw-grid-wrap"><table class="grading-table overview-table"><thead><tr>' +
        '<th>Schüler</th><th>Ø ÜB</th><th>Mappe 1. Sem.</th><th>Mat. vergessen</th><th>Laptop vergessen</th><th>Berechnet</th><th>Note (1. Sem.)</th>' +
        (isYear ? '<th>Projekt</th><th>Note (Jahr)</th>' : '') +
        '<th>Bemerkung</th>' +
        '</tr></thead><tbody>';
    students.forEach(s => {
        const st = status[s.id] || {};
        const m = mitarbeit[s.id] || {};
        let wsSum = 0, wsCount = 0;
        let sum = 0, totalWeight = 0;
        worksheets.forEach(w => {
            const cell = st[w.nr] || {};
            const grade = cell.grade || '';
            if (grade && grade !== 'missing') { wsSum += parseFloat(grade); wsCount++; }
        });
        const avg = wsCount > 0 ? (wsSum / wsCount).toFixed(2) : '–';
        let calcSemester = null, calcYear = null;
        if (wsCount > 0) { sum += wsSum; totalWeight += wsCount; }
        const folderGrade = parseFloat(m.folder1);
        if (weights.portfolio && !isNaN(folderGrade)) { sum += folderGrade * weights.portfolio; totalWeight += weights.portfolio; }
        const attendanceGrade = parseFloat(st.attendance);
        if (weights.attendance && !isNaN(attendanceGrade)) { sum += attendanceGrade * weights.attendance; totalWeight += weights.attendance; }
        const projectGrade = parseFloat(st.project);
        if (includeProject && weights.project && !isNaN(projectGrade)) { sum += projectGrade * weights.project; totalWeight += weights.project; }
        const finalGrade = totalWeight > 0 ? sum / totalWeight : null;
        calcSemester = !isYear ? finalGrade : null;
        calcYear = isYear ? finalGrade : null;
        const semesterManual = semesterManualGrades[s.id] != null ? semesterManualGrades[s.id] : null;
        const manual = manualGrades[s.id] != null ? manualGrades[s.id] : null;
        const pr = project[s.id] || {};
        const forgot = getGZForgottenCounts(classId, s.id);
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>' +
            '<td>' + avg + '</td>' +
            '<td>' + (m.folder1 != null ? m.folder1 : '–') + '</td>' +
            '<td style="text-align:center;">' + (forgot.material || 0) + '</td>' +
            '<td style="text-align:center;">' + (forgot.laptop || 0) + '</td>' +
            '<td>' + (calcSemester != null ? calcSemester.toFixed(2) : '–') + '</td>' +
            '<td>' + (!isYear ? gradeSelect(semesterManual, "setSemesterManualGrade('" + classId + "','" + s.id + "',this.value)") : (semesterManual != null ? semesterManual : '–')) + '</td>' +
            (isYear ? '<td>' + (st.project != null ? st.project : '–') + '</td>' : '') +
            (isYear ? '<td>' + (manual != null ? manual : '–') + '</td>' : '') +
            '<td><input type="text" class="grade-input" value="' + escapeHtml(remarks[s.id] || '') + '" onchange="setSemesterRemark(\'' + classId + '\',\'' + s.id + '\',this.value)" placeholder="…"></td>' +
            '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
}

window.setSemesterManualGrade = function(classId, studentId, val) {
    captureUndo();
    const m = DB.loadSemesterManualGrades(classId);
    if (val === '') delete m[studentId];
    else m[studentId] = parseFloat(val);
    DB.saveSemesterManualGrades(classId, m);
    renderGrading();
};

window.setSemesterRemark = function(classId, studentId, value) {
    captureUndo();
    const remarks = DB.loadSemesterRemarks(classId);
    remarks[studentId] = value || '';
    DB.saveSemesterRemarks(classId, remarks);
    renderGrading();
};

window.renderGZWorksheets = renderGZWorksheets;
window.renderGZGrades = renderGZGrades;
window.renderGZProject = renderGZProject;
window.renderGZOverview = renderGZOverview;
window.openWeightsModal = openWeightsModal;
window.saveWeights = saveWeights;

let allGradesOverviewScope = 'semester';

function renderGradesOverview() {
    const isYear = allGradesOverviewScope === 'year';
    const classes = DB.getSortedClasses();
    let html = '<div class="view-header" style="display:block;"><div><p class="subtitle">Alle Noten aller Klassen und Schüler.</p></div>' +
        '<div class="grading-controls" style="margin-bottom:15px;">' +
        '<button class="btn no-print" onclick="window.exportGradesCSV()" style="margin-right:10px;">CSV Export</button>' +
        '<button class="btn ' + (isYear ? 'btn-secondary' : '') + '" onclick="setAllGradesOverviewScope(\'semester\')">1. Semester</button>' +
        '<button class="btn ' + (isYear ? '' : 'btn-secondary') + '" onclick="setAllGradesOverviewScope(\'year\')">Ganzes Jahr</button>' +
        '<button class="btn no-print" onclick="window.openGradesOverviewPrint()" style="margin-left:10px;">🖨️ Drucken</button>' +
        '</div>';
    classes.forEach(cls => {
        const students = DB.getStudentsForClass(cls.id);
        if (!students.length) return;
        html += '<div class="all-grades-section">';
        html += '<h2>' + escapeHtml(cls.name) + ' – ' + escapeHtml(cls.subject) + '</h2>';
        if (cls.type === 'gz') {
            html += renderGZAllOverview(cls, students);
        } else {
            html += renderStandardAllOverview(cls, students, isYear);
        }
        html += '</div>';
    });
    const container = document.getElementById('grades-overview-container');
    if (container) container.innerHTML = html;
}

function setAllGradesOverviewScope(scope) { allGradesOverviewScope = scope; renderGradesOverview(); }

window.openGradesOverviewPrint = function() {
    const container = document.getElementById('grades-overview-container');
    if (!container) return;
    const content = container.innerHTML;
    const printStyle = [
        '@page { margin: 15mm; }',
        'body { font-family: Inter, Arial, sans-serif; background: #fff !important; color: #000 !important; padding: 20px; }',
        'h1 { font-size: 22px; margin-bottom: 4px; color: #000 !important; }',
        'h2 { font-size: 16px; margin-top: 22px; margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 4px; color: #000 !important; page-break-after: avoid; }',
        '.all-grades-section { margin-bottom: 28px; page-break-inside: avoid; }',
        'table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; table-layout: auto; }',
        'th, td { border: 1px solid #888; padding: 6px 8px; text-align: left; color: #000 !important; background: #fff !important; }',
        'th { background: #f4f4f4 !important; font-weight: 700; }',
        '.grade-cell { font-weight: 700; text-align: center; }',
        '.grade-1 { color: #065f46 !important; background: #d1fae5 !important; }',
        '.grade-4 { color: #92400e !important; background: #fef3c7 !important; }',
        '.grade-5 { color: #991b1b !important; background: #fee2e2 !important; }',
        '.ov-pts { font-size: 10px; color: #000 !important; }',
        'h1, h2, h3, p { color: #000 !important; }',
        'small { color: #444 !important; }',
        '.stu-avatar { display: none !important; }',
        '.stu-namecell { display: inline; }'
    ].join('\n');
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Notenübersicht</title>' +
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">' +
        '<style>' + printStyle + '</style>' +
        '</head><body>' + content + '</body></html>';
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'width=1200,height=800');
    setTimeout(function() {
        if (win) {
            win.document.close();
            win.focus();
            setTimeout(function() {
                win.print();
                setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
            }, 300);
        }
    }, 400);
};

function renderStandardAllOverview(cls, students, isYear) {
    const classId = cls.id;
    const allHws = filterPlanBySchoolYear(sortedPlan(classId).filter(e => e.homeworkNr)).map(e => ({ nr: e.homeworkNr, date: e.date }));
    const allExams = DB.loadExams(classId);
    const cutoff = DB.loadSemesterCutoff(classId);
    const exams = (!isYear && cutoff) ? allExams.filter(e => !e.date || e.date <= cutoff) : allExams;
    const hws = (!isYear && cutoff) ? allHws.filter(e => !e.date || e.date <= cutoff) : allHws;
    const weights = DB.loadWeights(classId);
    const manual = DB.loadManualGrades(classId);
    const semesterManual = DB.loadSemesterManualGrades(classId);
    const pruefung = DB.loadPruefung(classId);
    const project = DB.loadProjectGrades(classId);
    const recs = DB.loadExamRecords(classId);
    let html = '<div class="hw-grid-wrap"><table class="grading-table overview-table"><thead><tr>' +
        '<th>Schüler</th><th>HÜ<br><small>Pkte / Note</small></th>';
    exams.forEach(e => html += '<th>SA ' + (e.nr || '') + '<br><small>Pkte / Note</small></th>');
    html += '<th>Ø SA</th><th>Prüf.</th><th>Projekt</th><th>Berechnet</th>';
    if (isYear) html += '<th>Note (1. Sem.)</th>';
    html += '<th>Note (ich)</th></tr></thead><tbody>';
    students.forEach(s => {
        const hw = computeHwGrade(classId, s.id, hws);
        let examSum = 0, examCount = 0;
        let examCells = '';
        exams.forEach(e => {
            const rec = (recs[s.id] && recs[s.id][e.id]);
            const isAbsent = !!rec && rec.absent;
            let sum = 0, has = false;
            if (rec && rec.examplePoints) {
                has = true;
                Object.values(rec.examplePoints).forEach(p => sum += parseFloat(p) || 0);
            }
            const g = isAbsent ? 'A' : ((has && e.maxPoints > 0) ? percentToGrade(sum / e.maxPoints * 100) : null);
            if (g != null && g !== 'A') { examSum += g; examCount++; }
            examCells += '<td><span class="ov-pts">' + (has && !isAbsent ? sum : '–') + '</span> / <span class="' + (isAbsent ? 'grade-absent' : gradeClass(g)) + ' grade-cell">' + (g != null ? g : '–') + '</span></td>';
        });
        const examAvg = examCount ? examSum / examCount : null;
        const pr = pruefung[s.id];
        const pruefGrade = (pr && pr.grade != null) ? pr.grade : null;
        const projGrade = (project[s.id] && project[s.id].grade != null) ? project[s.id].grade : null;
        const parts = [];
        if (hw.grade != null) parts.push(hw.grade * weights.hw);
        if (examAvg != null) parts.push(examAvg * weights.exam);
        if (pruefGrade != null) parts.push(pruefGrade * weights.pruefung);
        if (projGrade != null) parts.push(projGrade * weights.project);
        const wSum = (hw.grade != null ? weights.hw : 0) + (examAvg != null ? weights.exam : 0) + (pruefGrade != null ? weights.pruefung : 0) + (projGrade != null ? weights.project : 0);
        const computed = parts.length && wSum > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / wSum * 100) / 100 : null;
        const activeManual = isYear ? (manual[s.id] != null ? manual[s.id] : null) : (semesterManual[s.id] != null ? semesterManual[s.id] : null);
        const semesterManualGrade = semesterManual[s.id] != null ? semesterManual[s.id] : null;
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>' +
            '<td><span class="ov-pts">' + hw.points + '</span> / <span class="' + gradeClass(hw.grade) + ' grade-cell">' + (hw.grade != null ? hw.grade : '–') + '</span></td>' +
            examCells +
            '<td>' + (examAvg != null ? '<span class="' + gradeClass(Math.round(examAvg)) + ' grade-cell">' + (Math.round(examAvg * 10) / 10) + '</span>' : '–') + '</td>' +
            '<td>' + (pruefGrade != null ? '<span class="' + gradeClass(pruefGrade) + ' grade-cell">' + pruefGrade + '</span>' : '–') + '</td>' +
            '<td>' + (projGrade != null ? '<span class="' + gradeClass(projGrade) + ' grade-cell">' + projGrade + '</span>' : '–') + '</td>' +
            '<td class="' + gradeClass(computed) + ' grade-cell">' + (computed != null ? computed : '–') + '</td>' +
            (isYear ? '<td class="' + gradeClass(semesterManualGrade) + ' grade-cell">' + (semesterManualGrade != null ? semesterManualGrade : '–') + '</td>' : '') +
            '<td>' + (activeManual != null ? '<span class="' + gradeClass(activeManual) + ' grade-cell">' + activeManual + '</span>' : '–') + '</td>' +
            '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
}

function renderGZAllOverview(cls, students) {
    const classId = cls.id;
    normalizeGZForgotten(classId);
    const worksheets = getGZPlannedWorksheets(classId);
    const status = DB.loadWorksheetStatus(classId);
    const weights = DB.loadGZGradeWeights(classId);
    const portfolio = DB.loadPortfolioGrades(classId);
    const project = DB.loadProjectGrades(classId);
    const manual = DB.loadManualGrades(classId);
    let html = '<div class="hw-grid-wrap"><table class="grading-table overview-table"><thead><tr>' +
        '<th>Schüler</th><th>Ø ÜB</th><th>Mappe</th><th>Mitarbeit</th><th>Projekt</th><th>Berechnet</th><th>Note (ich)</th><th>Mat. vergessen</th><th>Laptop vergessen</th></tr></thead><tbody>';
    students.forEach(s => {
        const st = status[s.id] || {};
        let sum = 0, count = 0;
        worksheets.forEach(w => {
            const cell = st[w.nr] || {};
            const grade = cell.grade || '';
            if (grade && grade !== 'missing') { sum += parseFloat(grade); count++; }
        });
        const avg = count > 0 ? (sum / count).toFixed(2) : '–';
        const p = portfolio[s.id] || {};
        const pr = project[s.id] || {};
        const att = st.attendance || '';
        const calc = calcGZGrade(s.id, classId, weights, true);
        const manualGrade = manual[s.id] != null ? manual[s.id] : null;
        const forgot = getGZForgottenCounts(classId, s.id);
        html += '<tr><td class="hw-sticky-left">' + studentNameHtml(s) + '</td>' +
            '<td>' + avg + '</td>' +
            '<td>' + (p.grade != null ? p.grade : '–') + '</td>' +
            '<td>' + (att != null ? att : '–') + '</td>' +
            '<td>' + (pr.grade != null ? pr.grade : '–') + '</td>' +
            '<td>' + (calc != null ? calc.toFixed(2) : '–') + '</td>' +
            '<td>' + (manualGrade != null ? manualGrade : '–') + '</td>' +
            '<td style="text-align:center;">' + (forgot.material || 0) + '</td>' +
            '<td style="text-align:center;">' + (forgot.laptop || 0) + '</td>' +
            '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
}

window.renderGradesOverview = renderGradesOverview;
window.exportGradesCSV = window.exportGradesCSV;

document.addEventListener('DOMContentLoaded', async function() {
    const offlineEl = document.getElementById('offline-indicator');
    function updateOfflineStatus() {
        if (!offlineEl) return;
        if (navigator.onLine) {
            offlineEl.textContent = 'Online';
            offlineEl.className = 'offline-indicator online';
        } else {
            offlineEl.textContent = 'Offline';
            offlineEl.className = 'offline-indicator offline';
        }
    }
    updateOfflineStatus();
    window.addEventListener('online', updateOfflineStatus);
    window.addEventListener('offline', updateOfflineStatus);

    const diag = document.getElementById('diagnose');
    if (diag) {
        try {
            const classes = DB.loadClasses();
            const students = DB.getStudentsSorted();
            const timetable = DB.getTimetable();
            diag.innerHTML = '<strong>Diagnose:</strong> ' + classes.length + ' Klassen | ' + students.length + ' Schüler | ' + timetable.length + ' Stundenplan-Einträge | localStorage=' + localStorage.length;
        } catch (e) {
            diag.innerHTML = 'Diagnose-Fehler: ' + e.message;
        }
    }
    
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => switchView(li.dataset.view));
    });
    var ttBtn = document.getElementById('open-timetable-btn');
    if (ttBtn) ttBtn.addEventListener('click', function() { window.setTimetableEditMode(!timetableEditMode); });
    var classBtn = document.getElementById('open-classmanager-btn');
    if (classBtn) classBtn.addEventListener('click', function() { openClassManager(); });
    var examBtn = document.getElementById('open-exammanager-btn');
    if (examBtn) examBtn.addEventListener('click', function() { openExamManagerFromSelect(); });
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return;
        if (target.classList && target.classList.contains('ex-pts-input')) return; // Schularbeit: Pfeiltasten übernehmen die Navigation
        const table = target.closest('.grading-table') || target.closest('table');
        if (!table) return;
        e.preventDefault();
        const tr = target.closest('tr');
        if (!tr) return;
        const nextRow = tr.nextElementSibling;
        if (!nextRow) return;
        const allInputs = nextRow.querySelectorAll('input, select');
        if (allInputs.length === 0) return;
        const currentInputs = Array.from(tr.querySelectorAll('input, select'));
        const currentIndex = currentInputs.indexOf(target);
        const targetIndex = Math.min(currentIndex >= 0 ? currentIndex : 0, allInputs.length - 1);
        console.log('Enter pressed, moving to next row input', targetIndex, allInputs[targetIndex]);
        setTimeout(function() { allInputs[targetIndex].focus(); }, 0);
    });
    document.addEventListener('keydown', function(e) {
        const t = e.target;
        if (!t || !t.classList || !t.classList.contains('ex-pts-input')) return;
        const key = e.key;
        if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') return;
        const body = t.closest('tbody');
        const rowEl = t.closest('tr');
        if (!body || !rowEl) return;
        const rows = Array.from(body.querySelectorAll('tr'));
        const r = rows.indexOf(rowEl);
        const inputs = Array.from(rowEl.querySelectorAll('input.ex-pts-input'));
        const c = inputs.indexOf(t);
        if (r < 0 || c < 0) return;
        let nr = r, nc = c;
        if (key === 'ArrowUp') nr = r - 1;
        else if (key === 'ArrowDown') nr = r + 1;
        else if (key === 'ArrowLeft') nc = c - 1;
        else if (key === 'ArrowRight') nc = c + 1;
        if (nr < 0 || nr >= rows.length) return;
        const targetRow = rows[nr];
        const targetInputs = Array.from(targetRow.querySelectorAll('input.ex-pts-input'));
        if (nc < 0 || nc >= targetInputs.length) return;
        const target = targetInputs[nc];
        console.log('[EXAM-NAV] key=' + key + ' r=' + r + ' c=' + c + ' -> nr=' + nr + ' nc=' + nc + ' target=' + (target ? 'ok' : 'none'));
        e.preventDefault();
        if (key === 'ArrowUp' || key === 'ArrowDown') { try { t.blur(); } catch (err) {} }
        try { target.focus(); } catch (err) {}
        try { target.select(); } catch (err) {}
        if (key === 'ArrowUp' || key === 'ArrowDown') setTimeout(function() { try { target.focus(); } catch (e) {} try { target.select(); } catch (e) {} }, 60);
    });
    document.addEventListener('keydown', function(e) {
        const target = e.target;
        if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return;
        const table = target.closest('#gz-grades-table') || target.closest('#mitarbeit-table');
        if (!table) return;
        const currentRow = target.closest('tr');
        if (!currentRow) return;
        const rowInputs = Array.from(currentRow.querySelectorAll('input, select'));
        const currentIndex = rowInputs.indexOf(target);
        if (currentIndex < 0) return;
        const allRows = Array.from(table.querySelectorAll('tbody tr'));
        const currentRowIndex = allRows.indexOf(currentRow);
        let targetRowIndex = currentRowIndex;
        let targetIndex = currentIndex;
        if (e.key === 'ArrowDown') {
            if (currentRowIndex < allRows.length - 1) targetRowIndex = currentRowIndex + 1;
            else return;
        } else if (e.key === 'ArrowUp') {
            if (currentRowIndex > 0) targetRowIndex = currentRowIndex - 1;
            else return;
        } else if (e.key === 'ArrowLeft') {
            if (currentIndex > 0) targetIndex = currentIndex - 1;
            else return;
        } else if (e.key === 'ArrowRight') {
            if (currentIndex < rowInputs.length - 1) targetIndex = currentIndex + 1;
            else return;
        } else return;
        e.preventDefault();
        const targetRow = allRows[targetRowIndex];
        const targetRowInputs = targetRow.querySelectorAll('input, select');
        if (targetIndex < targetRowInputs.length && targetRowInputs[targetIndex]) {
            targetRowInputs[targetIndex].focus();
        }
    });
    document.addEventListener('keydown', function(e) {
        if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v')) return;
        if (!window._selectedStudentId || !window._selectedClassId) return;
        const modal = document.getElementById('modal-overlay');
        if (!modal || modal.style.display === 'none') return;
        e.preventDefault();
        pasteStudentPhoto(window._selectedStudentId, window._selectedClassId);
    });
    const isWebApp = !window.location.hostname.startsWith('localhost') && !window.location.hostname.startsWith('127.0.0.1');
    let usedOneDriveInDesktop = false;
    if (window.OD) {
        try { await window.OD.init(); } catch (e) { console.error('OD init failed', e); }
        const odConfigured = !!(window.OD.getClientId && window.OD.getClientId());
        const odConnected = !!(window.OD.isConnected && window.OD.isConnected());
        if (!isWebApp && odConfigured && odConnected && window.OneDrivePersist) {
            if (window.OD.useCloud) window.OD.useCloud();
            usedOneDriveInDesktop = true;
        } else if (window.OD.getProvider && window.OD.getProvider() === 'onedrive' && odConnected && window.OneDrivePersist) {
            window.FilePersist = window.OneDrivePersist;
            if (window.OD.setProvider) window.OD.setProvider('onedrive');
            if (window.LocalPersist) window.LocalPersist.stopAutoSave();
            await window.OneDrivePersist.loadFromFile();
            window.OneDrivePersist.startAutoSave();
        } else if (isWebApp) {
            window.FilePersist = {
                available: true,
                scheduleSave: function() {},
                startAutoSave: function() {},
                stopAutoSave: function() {},
                chooseFile: async function() {
                    alert('Bitte verbinden Sie sich zuerst mit OneDrive (☁️), um Daten zu speichern.');
                    return false;
                },
                bootstrap: async function() {
                    alert('Bitte verbinden Sie sich zuerst mit OneDrive (☁️), um Daten zu laden und zu speichern.');
                },
                saveToFile: async function() {
                    alert('Achtung: OneDrive ist nicht verbunden. Speichern nicht möglich. Bitte verbinden Sie sich mit OneDrive (☁️).');
                },
                loadFromFile: async function() {
                    alert('Achtung: OneDrive ist nicht verbunden. Laden nicht möglich. Bitte verbinden Sie sich mit OneDrive (☁️).');
                }
            };
        }
    }
    try { renderODConfig(); } catch (e) {}
    if (!usedOneDriveInDesktop) {
        await FilePersist.bootstrap();
    }
    if (typeof setODStatus === 'function') {
        setODStatus(window.OD && window.OD.isConnected && window.OD.isConnected());
    }
    const webNeedOD = isWebApp && !(window.OD && window.OD.getProvider && window.OD.getProvider() === 'onedrive' && window.OD.isConnected && window.OD.isConnected());
    if (webNeedOD) {
        await new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
            overlay.innerHTML = '<div style="background:var(--bg-panel);color:var(--text-main);max-width:520px;width:100%;border-radius:12px;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,0.35);">' +
                '<h2 style="margin-top:0;">OneDrive-Anmeldung erforderlich</h2>' +
                '<p class="subtitle">Bitte verbinden Sie sich mit OneDrive, um Ihre Daten zu laden und zu speichern. Ohne Anmeldung kann die App nicht verwendet werden.</p>' +
                '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">' +
                '<button class="btn" id="od-start-btn">Mit OneDrive verbinden</button>' +
                '</div>' +
                '</div>';
            document.body.appendChild(overlay);
            const btn = overlay.querySelector('#od-start-btn');
            const finish = () => { overlay.remove(); resolve(); };
            btn.onclick = async () => {
                try {
                    if (window.OD && window.OD.connect) {
                        await window.OD.connect();
                        if (window.OD.isConnected && window.OD.isConnected() && window.OneDrivePersist) {
                            window.FilePersist = window.OneDrivePersist;
                            if (window.OD.setProvider) window.OD.setProvider('onedrive');
                            if (window.LocalPersist) window.LocalPersist.stopAutoSave();
                            await window.OneDrivePersist.loadFromFile();
                            window.OneDrivePersist.startAutoSave();
                            if (typeof setODStatus === 'function') setODStatus(true);
                        }
                    }
                } catch (e) {
                    console.error('OD connect from startup modal failed', e);
                } finally {
                    finish();
                }
            };
        });
    }
    setInterval(() => {
        if (typeof setODStatus === 'function') {
            setODStatus(window.OD && window.OD.isConnected && window.OD.isConnected());
        }
    }, 30000);
    const classes = DB.loadClasses();
    classes.forEach(c => {
        const sem = DB.loadSemesterManualGrades(c.id);
        if (Object.keys(sem).length === 0) {
            const legacy = DB.loadManualGrades(c.id);
            if (Object.keys(legacy).length > 0) {
                DB.saveSemesterManualGrades(c.id, legacy);
            }
        }
    });
    updateDataFileUI();
    initSidebar();
    switchView('dashboard');
    populateGradeClassSelect();
    renderDashboard();
    renderClasses();
});

function renderTodos() {
    const container = document.getElementById('todos-container');
    if (!container) return;
    const todos = DB.loadTodos();
    if (!todos.length) {
        container.innerHTML = '<p class="subtitle">Keine Aufgaben. Legen Sie oben eine neue an.</p>';
        return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
    const weekEndStr = weekEnd.getFullYear() + '-' + String(weekEnd.getMonth() + 1).padStart(2, '0') + '-' + String(weekEnd.getDate()).padStart(2, '0');

    const groups = [];
    const groupOrder = ['overdue', 'today', 'tomorrow', 'week', 'later', 'nodate', 'done'];
    const groupMeta = {
        overdue: 'Überfällig',
        today: 'Heute',
        tomorrow: 'Morgen',
        week: 'Diese Woche',
        later: 'Später',
        nodate: 'Ohne Datum',
        done: 'Erledigt'
    };
    const groupMap = {};
    groupOrder.forEach(k => groupMap[k] = []);

    todos.forEach(t => {
        let key = 'nodate';
        if (t.done) key = 'done';
        else if (t.dueDate) {
            if (t.dueDate < todayStr) key = 'overdue';
            else if (t.dueDate === todayStr) key = 'today';
            else if (t.dueDate === tomorrowStr) key = 'tomorrow';
            else if (t.dueDate <= weekEndStr) key = 'week';
            else key = 'later';
        }
        groupMap[key].push(t);
    });

    Object.keys(groupMap).forEach(key => {
        groupMap[key].sort((a, b) => {
            const ad = a.dueDate || '9999-99-99';
            const bd = b.dueDate || '9999-99-99';
            if (ad < bd) return -1;
            if (ad > bd) return 1;
            return a.text.localeCompare(b.text);
        });
    });

    let html = '';
    groupOrder.forEach(key => {
        const items = groupMap[key];
        if (!items.length) return;
        html += '<div class="todo-group">';
        html += '<div class="todo-group-title">' + groupMeta[key] + ' (' + items.length + ')</div>';
        html += '<ul class="todo-list">';
        items.forEach(t => {
            let dueClass = '';
            let dueLabel = '';
            if (t.dueDate) {
                if (!t.done && t.dueDate < todayStr) dueClass = ' todo-overdue';
                else if (!t.done && t.dueDate === todayStr) dueClass = ' todo-today';
                const d = new Date(t.dueDate + 'T00:00:00');
                const weekdays = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
                dueLabel = '<span class="todo-due' + dueClass + '">fällig bis ' + weekdays[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear() + '</span>';
            }
            html += '<li class="todo-item' + (t.done ? ' todo-done' : '') + '">' +
                '<label class="todo-check"><input type="checkbox" ' + (t.done ? 'checked' : '') + ' onchange="DB.toggleTodo(\'' + t.id + '\'); renderTodos();"></label>' +
                '<span class="todo-text" contenteditable="true" onblur="DB.saveTodoText(\'' + t.id + '\', this.textContent); renderTodos();">' + escapeHtml(t.text) + '</span>' +
                dueLabel +
                '<button class="btn btn-secondary todo-del" onclick="DB.deleteTodo(\'' + t.id + '\'); renderTodos();">×</button>' +
                '</li>';
        });
        html += '</ul></div>';
    });
    container.innerHTML = html;
}

window.addTodo = function() {
    const content = '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<input type="text" id="new-todo-text" placeholder="Neue Aufgabe..." style="padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-dark);color:white;font-family:inherit;">' +
        '<input type="date" id="new-todo-date" style="padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-dark);color:white;font-family:inherit;">' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
        '<button class="btn btn-secondary" onclick="hideModal()">Abbrechen</button>' +
        '<button class="btn" id="save-new-todo">Speichern</button>' +
        '</div></div>';
    showModal(content);
    document.getElementById('new-todo-text').focus();
    const saveBtn = document.getElementById('save-new-todo');
    const saveHandler = function() {
        const text = document.getElementById('new-todo-text').value.trim();
        const date = document.getElementById('new-todo-date').value;
        if (!text) { alert('Bitte Text eingeben.'); return; }
        DB.addTodo(text, date);
        hideModal();
        renderTodos();
    };
    if (saveBtn) saveBtn.onclick = saveHandler;
};

DB.saveTodoText = function(id, text) {
    const todos = DB.loadTodos();
    const todo = todos.find(t => t.id === id);
    if (todo) { todo.text = text.trim(); DB.saveTodos(todos); }
};

(function initTheme() {
    try {
        const saved = DB.load('theme', 'dark');
        applyTheme(saved);
    } catch (e) {}
})();