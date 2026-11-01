import { Routes } from '@angular/router';
import { HomeComponent } from './student/home.component';
import { authGuard, adminGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'c/:code', loadComponent: () => import('./student/checkin-flow.component').then(m => m.CheckinFlowComponent) },
  { path: 't/login', loadComponent: () => import('./teacher/login.component').then(m => m.LoginComponent) },
  // Projection view: full screen, no teacher shell/menu (06 §3).
  {
    path: 't/sessions/:id/display',
    canActivate: [authGuard],
    loadComponent: () => import('./teacher/display.component').then(m => m.DisplayComponent),
  },
  {
    path: 't',
    loadComponent: () => import('./teacher/teacher-shell.component').then(m => m.TeacherShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./teacher/courses.component').then(m => m.CoursesComponent) },
      { path: 'courses/:id', loadComponent: () => import('./teacher/course-detail.component').then(m => m.CourseDetailComponent) },
      { path: 'classrooms', loadComponent: () => import('./teacher/classrooms.component').then(m => m.ClassroomsComponent) },
      { path: 'sessions/new', loadComponent: () => import('./teacher/session-create.component').then(m => m.SessionCreateComponent) },
      { path: 'sessions/:id', loadComponent: () => import('./teacher/session-dashboard.component').then(m => m.SessionDashboardComponent) },
      { path: 'sessions/:id/calibrate', loadComponent: () => import('./teacher/calibrate.component').then(m => m.CalibrateComponent) },
      { path: 'admin/teachers', canActivate: [adminGuard], loadComponent: () => import('./teacher/admin-teachers.component').then(m => m.AdminTeachersComponent) },
    ],
  },
  { path: '**', loadComponent: () => import('./shared/not-found.component').then(m => m.NotFoundComponent) },
];
