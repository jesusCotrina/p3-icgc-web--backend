import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../controllers/auth.controller';
import * as posts from '../controllers/posts.controller';
import * as media from '../controllers/media.controller';
import * as settings from '../controllers/settings.controller';
import * as dashboard from '../controllers/dashboard.controller';
import * as courses from '../controllers/courses.controller';
import * as projects from '../controllers/projects.controller';
import * as contact from '../controllers/contact.controller';
import * as publicApi from '../controllers/public.controller';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { uploadImage, uploadLogo, uploadVideo } from '../middleware/upload';

export const router = Router();

// ───────────────────────────── Salud ─────────────────────────────

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ───────────────────────────── Auth ─────────────────────────────

// Freno a la fuerza bruta: 10 intentos de login cada 15 minutos por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Demasiados intentos. Espera 15 minutos.' },
});

router.post('/auth/login', loginLimiter, auth.login);
router.get('/auth/me', requireAuth, auth.me);
router.post('/auth/change-password', requireAuth, auth.changePassword);

// ───────────────────── API pública (la consume Next.js) ─────────────────────

router.get('/public/posts', publicApi.listPublicPosts);
router.get('/public/posts/:slug', publicApi.getPublicPost);
router.post('/public/posts/:slug/views', publicApi.incrementViews);
router.get('/public/categories', publicApi.listPublicCategories);
router.get('/public/settings', publicApi.getPublicSettings);
router.get('/public/sitemap', publicApi.getSitemapData);
router.get('/public/courses', courses.listPublicCourses);
router.get('/public/courses/:slug', courses.getPublicCourse);
router.get('/public/media/:id/thumb', media.mediaThumbnail);
router.get('/public/projects', projects.listPublicProjects);

// Formulario de contacto: 5 envíos cada 15 minutos por IP, contra el spam
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'TooManyRequests',
    message: 'Enviaste varios mensajes seguidos. Inténtalo de nuevo en unos minutos.',
  },
});
router.post('/public/contact', contactLimiter, contact.createContactMessage);

// ───────────────────── Gestor (todo detrás del token) ─────────────────────

const admin = Router();
admin.use(requireAuth, requireAdmin);

admin.get('/dashboard', dashboard.getDashboard);
admin.get('/server-stats', dashboard.getServerStats);

admin.get('/posts', posts.listPosts);
admin.post('/posts', posts.createPost);
admin.get('/posts/:id', posts.getPost);
admin.put('/posts/:id', posts.updatePost);
admin.patch('/posts/:id/status', posts.changeStatus);
admin.get('/posts/:id/seo', posts.getPostSeo);
admin.delete('/posts/:id', posts.deletePost);

admin.get('/categories', posts.listCategories);
admin.post('/categories', posts.createCategory);
admin.delete('/categories/:id', posts.deleteCategory);

admin.get('/courses', courses.listCourses);
admin.post('/courses', courses.createCourse);
admin.get('/courses/:id', courses.getCourse);
admin.put('/courses/:id', courses.updateCourse);
admin.delete('/courses/:id', courses.deleteCourse);

admin.get('/projects', projects.listProjects);
admin.post('/projects', projects.createProject);
admin.get('/projects/:id', projects.getProject);
admin.put('/projects/:id', projects.updateProject);
admin.delete('/projects/:id', projects.deleteProject);

admin.get('/contact-messages', contact.listContactMessages);
admin.patch('/contact-messages/:id', contact.markContactMessage);
admin.delete('/contact-messages/:id', contact.deleteContactMessage);

admin.get('/media', media.listMedia);
admin.post('/media/images', uploadImage.single('file'), media.uploadImageHandler);
admin.post('/media/videos', uploadVideo.single('file'), media.uploadVideoHandler);
admin.patch('/media/:id', media.updateMedia);
admin.delete('/media/:id', media.deleteMedia);
admin.get('/media/check-orphans', media.checkOrphans);

admin.get('/settings', settings.getSettings);
admin.put('/settings', settings.updateSettings);
admin.post('/settings/logo', uploadLogo.single('file'), settings.uploadLogoHandler);

router.use('/admin', admin);
