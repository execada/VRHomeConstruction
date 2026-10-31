import { takeLatest, put, select, all, call } from 'typed-redux-saga';
import { ModalsFeature } from '@/features/modals';
import { actions } from './slice';
import { selectors } from './selectors';
import { projectsApi } from '@/app/api';

function* handleCreateProject() {
  try {
    const projectName = yield* select(selectors.selectProjectName);
    if (!projectName.trim()) {
      throw new Error('Введите название проекта');
    }
    yield* put(actions.setIsLoading(true));
    yield* put(actions.setError(null));

    const project = yield* call(projectsApi.createProject, { name: projectName.trim(), status: 'active' as const });

    yield* put(actions.addProject(project));
    yield* put(actions.resetForm());
    yield* put(ModalsFeature.actions.closeCreateProjectModal());
  } catch (error: any) {
    const errorMessage = error.message || 'Ошибка при создании проекта';
    yield* put(actions.setError(errorMessage));
  } finally {
    yield* put(actions.setIsLoading(false));
  }
}

/** Загрузить список проектов пользователя (при входе и по кнопке «Повторить»). */
export function* loadProjects() {
  yield* put(actions.setProjectsStatus('loading'));
  try {
    const projects = yield* call(projectsApi.fetchProjects);
    // Заменяем список целиком: открытый в редакторе проект мог попасть в список раньше.
    yield* put(actions.setProjects(projects));
    yield* put(actions.setProjectsStatus('ready'));
  } catch (error) {
    console.error('Failed to load projects:', error);
    yield* put(actions.setProjectsStatus('error'));
  }
}

function* handleDeleteProject(action: ReturnType<typeof actions.removeProject>) {
  try {
    yield* call(projectsApi.deleteProject, action.payload);
  } catch (error: any) {
    console.error('Delete project error:', error);
  }
}

export function* initSaga() {
  yield all([
    takeLatest(actions.createProjectRequested.type, handleCreateProject),
    takeLatest(actions.removeProject.type, handleDeleteProject),
    takeLatest(actions.loadProjectsRequested.type, loadProjects),
  ]);
}
