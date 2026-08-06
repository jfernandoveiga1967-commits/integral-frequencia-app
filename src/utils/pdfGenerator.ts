import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student, AttendanceRecord, TurmaType, WeekInfo } from '../types';

// Helper to format date DD/MM/YYYY
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Status labels and styling for PDF
function getStatusText(status: string): string {
  switch (status) {
    case 'presente':
      return 'Presente';
    case 'falta':
      return 'Falta';
    case 'saude':
      return 'Ausência Saúde';
    case 'sem_equipamento':
      return 'Sem Equipamento';
    default:
      return status;
  }
}

/**
 * Generates an individual Student Attendance PDF Report
 */
export function generateStudentPDFReport(
  student: Student,
  week: WeekInfo,
  records: AttendanceRecord[]
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const studentRecords = records.filter((r) => r.studentId === student.id);
  const total = studentRecords.length;
  const pres = studentRecords.filter((r) => r.status === 'presente').length;
  const falta = studentRecords.filter((r) => r.status === 'falta').length;
  const saude = studentRecords.filter((r) => r.status === 'saude').length;
  const semEquip = studentRecords.filter((r) => r.status === 'sem_equipamento').length;
  const rate = total > 0 ? Math.round((pres / total) * 100) : 100;

  // Header Banner
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, 210, 32, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('RELATÓRIO DE FREQUÊNCIA DO ALUNO', 14, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(191, 219, 254); // blue-200
  doc.text('Atividades Extracurriculares - Programa Integral', 14, 22);

  doc.setTextColor(226, 232, 240);
  doc.text(`Período: ${week.label}`, 196, 22, { align: 'right' });

  // Student Info Card Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 38, 182, 30, 3, 3, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Aluno(a): ${student.name}`, 18, 46);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Turma / Ano: ${student.turma}`, 18, 53);
  doc.text(`Atividades Matriculadas: ${student.activities.join(', ')}`, 18, 60);

  // Performance Badge
  doc.setFillColor(rate >= 85 ? 240 : rate >= 70 ? 254 : 254, rate >= 85 ? 253 : rate >= 70 ? 243 : 226, rate >= 85 ? 244 : rate >= 70 ? 199 : 226);
  doc.setFillColor(238, 242, 255);
  doc.roundedRect(138, 42, 52, 22, 2, 2, 'FD');

  doc.setTextColor(67, 56, 202);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TAXA DE PRESENÇA', 164, 48, { align: 'center' });
  doc.setFontSize(14);
  doc.text(`${rate}%`, 164, 57, { align: 'center' });

  // Summary Metrics Bar
  let startY = 74;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Resumo de Participação na Semana:', 14, startY);

  startY += 4;
  const metrics = [
    { label: 'Presenças', val: pres, color: [16, 185, 129] },
    { label: 'Faltas', val: falta, color: [239, 68, 68] },
    { label: 'Ausência Saúde', val: saude, color: [217, 119, 6] },
    { label: 'Sem Equipamento', val: semEquip, color: [234, 88, 12] },
  ];

  metrics.forEach((m, idx) => {
    const x = 14 + idx * 46;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(x, startY, 43, 14, 2, 2, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(m.label.toUpperCase(), x + 4, startY + 5);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.text(String(m.val), x + 4, startY + 11);
  });

  // Table of Records
  startY += 20;

  const tableData = studentRecords.map((r) => [
    formatDate(r.date),
    r.activity,
    getStatusText(r.status),
    r.equipmentMissingDetails || r.observation || '-',
  ]);

  autoTable(doc, {
    startY: startY,
    head: [['Data', 'Atividade', 'Status', 'Detalhes / Observações']],
    body: tableData.length > 0 ? tableData : [['-', '-', 'Sem registros lançados nesta semana', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [51, 65, 85],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 32 },
      2: { cellWidth: 38, fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const val = data.cell.raw as string;
        if (val === 'Presente') {
          data.cell.styles.textColor = [16, 185, 129];
        } else if (val === 'Falta') {
          data.cell.styles.textColor = [239, 68, 68];
        } else if (val === 'Sem Equipamento') {
          data.cell.styles.textColor = [234, 88, 12];
        } else if (val === 'Ausência Saúde') {
          data.cell.styles.textColor = [217, 119, 6];
        }
      }
    },
  });

  // Footer / Signature
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 25 : 220;
  if (finalY < 260) {
    doc.setDrawColor(203, 213, 225);
    doc.line(20, finalY, 90, finalY);
    doc.line(120, finalY, 190, finalY);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Assinatura do Responsável', 55, finalY + 5, { align: 'center' });
    doc.text('Coordenação de Atividades Extracurriculares', 155, finalY + 5, { align: 'center' });
  }

  // Page numbering
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Relatório emitido em ${new Date().toLocaleDateString('pt-BR')} - Frequência Escolar Integral`,
    105,
    288,
    { align: 'center' }
  );

  doc.save(`Frequencia_${student.name.replace(/\s+/g, '_')}_Semana_${week.weekNumber}.pdf`);
}

/**
 * Generates a Turma Class Attendance PDF Report
 */
export function generateTurmaPDFReport(
  turma: TurmaType,
  week: WeekInfo,
  students: Student[],
  records: AttendanceRecord[]
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const turmaStudents = students.filter((s) => s.turma === turma);
  const studentIdsInTurma = new Set(turmaStudents.map((s) => s.id));
  const turmaRecords = records.filter(
    (r) => r.turma === turma || studentIdsInTurma.has(r.studentId)
  );

  const total = turmaRecords.length;
  const pres = turmaRecords.filter((r) => r.status === 'presente').length;
  const falta = turmaRecords.filter((r) => r.status === 'falta').length;
  const saude = turmaRecords.filter((r) => r.status === 'saude').length;
  const semEquip = turmaRecords.filter((r) => r.status === 'sem_equipamento').length;
  const rate = total > 0 ? Math.round((pres / total) * 100) : 100;

  // Header Banner
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, 210, 32, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`RELATÓRIO DA TURMA: ${turma.toUpperCase()}`, 14, 15);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(191, 219, 254);
  doc.text('Frequência em Atividades Extracurriculares', 14, 22);

  doc.setTextColor(226, 232, 240);
  doc.text(`Período: ${week.label}`, 196, 22, { align: 'right' });

  // Class Overview Card Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 38, 182, 28, 3, 3, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Turma / Ano Escolar: ${turma}`, 18, 46);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Total de Alunos Matriculados: ${turmaStudents.length}`, 18, 53);
  doc.text(`Total de Apontamentos de Chamada na Semana: ${total}`, 18, 59);

  // Overall Rate Badge
  doc.setFillColor(238, 242, 255);
  doc.roundedRect(138, 42, 52, 20, 2, 2, 'FD');
  doc.setTextColor(67, 56, 202);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('MÉDIA DE PRESENÇA', 164, 48, { align: 'center' });
  doc.setFontSize(13);
  doc.text(`${rate}%`, 164, 56, { align: 'center' });

  // Metrics Bar
  let startY = 72;
  const metrics = [
    { label: 'Presenças', val: pres, color: [16, 185, 129] },
    { label: 'Faltas', val: falta, color: [239, 68, 68] },
    { label: 'Ausência Saúde', val: saude, color: [217, 119, 6] },
    { label: 'Sem Equipamento', val: semEquip, color: [234, 88, 12] },
  ];

  metrics.forEach((m, idx) => {
    const x = 14 + idx * 46;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(x, startY, 43, 13, 2, 2, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(m.label.toUpperCase(), x + 4, startY + 5);

    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.text(String(m.val), x + 4, startY + 10.5);
  });

  // Table of Students & Summary
  startY += 20;

  const tableData = turmaStudents.map((st) => {
    const stRecords = turmaRecords.filter((r) => r.studentId === st.id);
    const stTotal = stRecords.length;
    const stPres = stRecords.filter((r) => r.status === 'presente').length;
    const stFalta = stRecords.filter((r) => r.status === 'falta').length;
    const stSaude = stRecords.filter((r) => r.status === 'saude').length;
    const stEquip = stRecords.filter((r) => r.status === 'sem_equipamento').length;
    const stRate = stTotal > 0 ? Math.round((stPres / stTotal) * 100) : '-';

    // Equipment or observation notes
    const occurrences = stRecords
      .filter((r) => r.status !== 'presente')
      .map((r) => `${r.activity}: ${getStatusText(r.status)}${r.equipmentMissingDetails ? ` (${r.equipmentMissingDetails})` : ''}`)
      .join('; ');

    return [
      st.name,
      st.activities.join(', '),
      stTotal > 0 ? `${stPres}/${stTotal}` : '0',
      stRate === '-' ? '100%' : `${stRate}%`,
      stEquip > 0 ? String(stEquip) : '0',
      stFalta > 0 ? String(stFalta) : '0',
      occurrences || 'Sem ocorrências',
    ];
  });

  autoTable(doc, {
    startY: startY,
    head: [['Aluno(a)', 'Atividades', 'Presença', 'Taxa', 'Sem Equip.', 'Faltas', 'Ocorrências da Semana']],
    body: tableData.length > 0 ? tableData : [['Sem alunos nesta turma', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 34 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
      6: { cellWidth: 'auto' },
    },
  });

  // Footer / Signature
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 25 : 220;
  if (finalY < 260) {
    doc.setDrawColor(203, 213, 225);
    doc.line(20, finalY, 90, finalY);
    doc.line(120, finalY, 190, finalY);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Professor(a) / Instrutor(a)', 55, finalY + 5, { align: 'center' });
    doc.text('Coordenação de Atividades Extracurriculares', 155, finalY + 5, { align: 'center' });
  }

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Relatório emitido em ${new Date().toLocaleDateString('pt-BR')} - Frequência Escolar Integral`,
    105,
    288,
    { align: 'center' }
  );

  doc.save(`Relatorio_Turma_${turma.replace(/[\/\s]+/g, '_')}_Semana_${week.weekNumber}.pdf`);
}
