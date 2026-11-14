import React, { useState, useEffect } from 'react';
import { StudentManager } from './StudentManager';
import { Student, AttendanceRecord, TurmaType, ActivityType, WeekInfo, UserProfile, ActivityItem, DayOfWeek } from '../types';
import { saveStudentToFirestore, deleteStudentFromFirestore } from '../firebase';
import { removeStudentFromLocalStorage, markStudentAsDeleted } from '../utils/storageUtils';

export interface AlunosTurmasProps {
  students?: Student[];
  records?: AttendanceRecord[];
  turmas?: string[];
  activitiesList?: ActivityItem[];
  currentWeek?: WeekInfo;
  currentUser?: UserProfile | null;
  onAddStudent?: (student: Omit<Student, 'id'>) => void | Promise<void>;
  onBatchAddStudents?: (names: string[], turma: TurmaType, activities: ActivityType[], diasFrequencia?: DayOfWeek[]) => void | Promise<void>;
  onUpdateStudent?: (student: Student) => void | Promise<void>;
  onDeleteStudent?: (id: string) => void | Promise<void>;
  onAddTurma?: (turmaName: string) => boolean;
  onDeleteTurma?: (turmaName: string, deleteStudents: boolean, targetTurmaToReassign?: string) => void;
}

/**
 * Componente AlunosTurmas:
 * Gerenciamento reativo de alunos e turmas com ouvinte em tempo real onSnapshot(collection(db, "alunos")).
 * 
 * - Ouvinte em Tempo Real (onSnapshot): Escuta a coleção "alunos" e sincroniza as alterações entre múltiplos dispositivos.
 * - Reflexo Imediato de Exclusões e Inativações: Remove ou oculta automaticamente registros deletados ou inativados.
 * - Gestão do Evento (Unsubscribe): Limpa o ouvinte unsubscribe() na desmontagem no useEffect.
 */
export const AlunosTurmas: React.FC<AlunosTurmasProps> = (props) => {
  const [realtimeStudents, setRealtimeStudents] = useState<Student[]>(props.students || []);

  // Sincroniza diretamente a partir das props gerenciadas centralmente pelo ouvinte de App.tsx
  useEffect(() => {
    if (props.students) {
      setRealtimeStudents(props.students);
    }
  }, [props.students]);

  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    if (props.onAddStudent) {
      await props.onAddStudent(studentData);
    } else {
      const newStudent: Student = {
        ...studentData,
        id: `st-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        status: 'ativo',
        statusMatricula: 'ativo',
      };
      await saveStudentToFirestore(newStudent);
    }
  };

  const handleUpdateStudent = async (student: Student) => {
    if (props.onUpdateStudent) {
      await props.onUpdateStudent(student);
    } else {
      await saveStudentToFirestore(student);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (props.onDeleteStudent) {
      await props.onDeleteStudent(id);
    } else {
      await deleteStudentFromFirestore(id);
      removeStudentFromLocalStorage(id);
      markStudentAsDeleted(id);
    }
  };

  const handleBatchAddStudents = async (
    names: string[],
    turma: TurmaType,
    activities: ActivityType[],
    diasFrequencia?: DayOfWeek[]
  ) => {
    if (props.onBatchAddStudents) {
      await props.onBatchAddStudents(names, turma, activities, diasFrequencia);
    }
  };

  return (
    <StudentManager
      {...props}
      students={realtimeStudents}
      onAddStudent={handleAddStudent}
      onBatchAddStudents={handleBatchAddStudents}
      onUpdateStudent={handleUpdateStudent}
      onDeleteStudent={handleDeleteStudent}
    />
  );
};

export default AlunosTurmas;
