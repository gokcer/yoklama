import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type * as M from './api.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /* Auth */
  csrf() { return firstValueFrom(this.http.get('/api/auth/csrf', { responseType: 'text', observe: 'response' })); }
  login(username: string, password: string) { return firstValueFrom(this.http.post<M.AuthUser>('/api/auth/login', { username, password })); }
  logout() { return firstValueFrom(this.http.post<void>('/api/auth/logout', {})); }
  me() { return firstValueFrom(this.http.get<M.AuthUser>('/api/auth/me')); }

  /* Teachers (admin) */
  getTeachers() { return firstValueFrom(this.http.get<M.TeacherDto[]>('/api/admin/teachers')); }
  createTeacher(t: { username: string; password: string; displayName: string; role: string }) { return firstValueFrom(this.http.post<M.TeacherDto>('/api/admin/teachers', t)); }
  updateTeacher(id: number, t: Partial<{ displayName: string; password: string; enabled: boolean }>) { return firstValueFrom(this.http.patch<M.TeacherDto>(`/api/admin/teachers/${id}`, t)); }

  /* Courses */
  getCourse(id: number | string) { return firstValueFrom(this.http.get<M.CourseDto>(`/api/courses/${id}`)); }
  getCourses() { return firstValueFrom(this.http.get<M.CourseDto[]>('/api/courses')); }
  createCourse(c: { code: string; name: string }) { return firstValueFrom(this.http.post<M.CourseDto>('/api/courses', c)); }
  updateCourse(id: number, c: { code: string; name: string }) { return firstValueFrom(this.http.put<M.CourseDto>(`/api/courses/${id}`, c)); }
  deleteCourse(id: number) { return firstValueFrom(this.http.delete<void>(`/api/courses/${id}`)); }
  getRoster(courseId: number) { return firstValueFrom(this.http.get<M.RosterEntryDto[]>(`/api/courses/${courseId}/roster`)); }
  importRoster(courseId: number, file: File, mode: string) {
    const fd = new FormData(); fd.append('file', file);
    return firstValueFrom(this.http.post<M.RosterImportResult>(`/api/courses/${courseId}/roster/import`, fd, { params: { mode } }));
  }
  addRosterEntry(courseId: number, e: { studentNo: string; fullName: string }) { return firstValueFrom(this.http.post<M.RosterEntryDto>(`/api/courses/${courseId}/roster`, e)); }
  deleteRosterEntry(courseId: number, studentNo: string) { return firstValueFrom(this.http.delete<void>(`/api/courses/${courseId}/roster/${encodeURIComponent(studentNo)}`)); }

  /* Classrooms */
  getClassrooms() { return firstValueFrom(this.http.get<M.ClassroomDto[]>('/api/classrooms')); }
  createClassroom(c: { name: string; latitude?: number; longitude?: number; radiusM?: number; bleBeaconId?: string }) { return firstValueFrom(this.http.post<M.ClassroomDto>('/api/classrooms', c)); }
  updateClassroom(id: number, c: { name: string; latitude?: number; longitude?: number; radiusM?: number; bleBeaconId?: string }) { return firstValueFrom(this.http.put<M.ClassroomDto>(`/api/classrooms/${id}`, c)); }
  deleteClassroom(id: number) { return firstValueFrom(this.http.delete<void>(`/api/classrooms/${id}`)); }
  generateBleKey(id: number) { return firstValueFrom(this.http.post<M.BleKeyResult>(`/api/classrooms/${id}/ble-key`, {})); }

  /* Sessions */
  getSessions(courseId?: number | string, status?: string) {
    let p = new HttpParams();
    if (courseId) p = p.set('courseId', courseId);
    if (status) p = p.set('status', status);
    return firstValueFrom(this.http.get<M.SessionDto[]>('/api/sessions', { params: p }));
  }
  getSession(id: number) { return firstValueFrom(this.http.get<M.SessionDto>(`/api/sessions/${id}`)); }
  createSession(s: Record<string, unknown>) { return firstValueFrom(this.http.post<M.SessionDto>('/api/sessions', s)); }
  openSession(id: number) { return firstValueFrom(this.http.post<M.SessionDto>(`/api/sessions/${id}/open`, {})); }
  extendSession(id: number, minutes: number) { return firstValueFrom(this.http.post<M.SessionDto>(`/api/sessions/${id}/extend`, { minutes })); }
  closeSession(id: number) { return firstValueFrom(this.http.post<M.SessionDto>(`/api/sessions/${id}/close`, {})); }
  reopenSession(id: number, minutes = 15) { return firstValueFrom(this.http.post<M.SessionDto>(`/api/sessions/${id}/reopen`, { minutes })); }
  deleteSession(id: number) { return firstValueFrom(this.http.delete<void>(`/api/sessions/${id}`)); }
  displayConfig(id: number) { return firstValueFrom(this.http.get<M.DisplayConfigDto>(`/api/sessions/${id}/display-config`)); }

  /* Attendance */
  getAttendances(sessionId: number) { return firstValueFrom(this.http.get<M.AttendanceDto[]>(`/api/sessions/${sessionId}/attendances`)); }
  decideAttendance(sessionId: number, attId: number, decision: string, note?: string) { return firstValueFrom(this.http.patch<M.AttendanceDto>(`/api/sessions/${sessionId}/attendances/${attId}`, { decision, note })); }
  manualAttendance(sessionId: number, studentNo: string, note?: string) { return firstValueFrom(this.http.post<M.AttendanceDto>(`/api/sessions/${sessionId}/attendances/manual`, { studentNo, note })); }
  bulkAttendance(sessionId: number, studentNumbers: string[], note?: string) { return firstValueFrom(this.http.post<M.BulkAttendanceResult>(`/api/sessions/${sessionId}/attendances/bulk`, { studentNumbers, note })); }
  deleteAttendance(sessionId: number, attId: number) { return firstValueFrom(this.http.delete<void>(`/api/sessions/${sessionId}/attendances/${attId}`)); }
  getAttempts(sessionId: number, state = 'REJECTED') { return firstValueFrom(this.http.get<M.AttemptDto[]>(`/api/sessions/${sessionId}/attempts`, { params: { state } })); }

  /* Calibration */
  getCalibrationRuns(sessionId: number) { return firstValueFrom(this.http.get<M.CalibrationRunDto[]>(`/api/sessions/${sessionId}/calibration-runs`)); }
  createCalibrationRun(sessionId: number, data: Record<string, unknown>) { return firstValueFrom(this.http.post<M.CalibrationRunDto>(`/api/sessions/${sessionId}/calibration-runs`, data)); }
  deleteCalibrationRun(sessionId: number, runId: number) { return firstValueFrom(this.http.delete<void>(`/api/sessions/${sessionId}/calibration-runs/${runId}`)); }
  reevaluate(sessionId: number) { return firstValueFrom(this.http.post<{ updated: number }>(`/api/sessions/${sessionId}/reevaluate`, {})); }

  /* Public */
  getPublicSession(code: string) { return firstValueFrom(this.http.get<M.PublicSessionDto>(`/api/public/sessions/${encodeURIComponent(code)}`)); }
  startCheckin(sessionCode: string, studentNo: string, client: Record<string, unknown>) { return firstValueFrom(this.http.post<M.CheckinStartResponse>('/api/public/checkins', { sessionCode, studentNo, client })); }
  syncCheckin(attemptId: string, offsetMs: number, rttMs: number) { return firstValueFrom(this.http.post<void>(`/api/public/checkins/${attemptId}/sync`, { offsetMs, rttMs })); }
  scanCheckin(attemptId: string, data: Record<string, unknown>) { return firstValueFrom(this.http.post<M.ScanResponse>(`/api/public/checkins/${attemptId}/scans`, data)); }
  uploadFrame(attemptId: string, frame: Blob, seq: number) {
    const fd = new FormData(); fd.append('frame', frame, 'frame.jpg'); fd.append('seq', String(seq));
    return firstValueFrom(this.http.post<void>(`/api/public/checkins/${attemptId}/frame`, fd));
  }
  bleNonce(attemptId: string) { return firstValueFrom(this.http.post<M.BleNonceResponse>(`/api/public/checkins/${attemptId}/ble-nonce`, {})); }
  bleVerify(attemptId: string, response: string) { return firstValueFrom(this.http.post<M.BleVerifyResponse>(`/api/public/checkins/${attemptId}/ble`, { response })); }
  completeCheckin(attemptId: string, data: Record<string, unknown>) { return firstValueFrom(this.http.post<M.CompleteResponse>(`/api/public/checkins/${attemptId}/complete`, data)); }

  /* Time */
  getServerTime() { return firstValueFrom(this.http.get<{ serverTime: number }>('/api/public/time', { headers: { 'Cache-Control': 'no-store' } })); }
}
