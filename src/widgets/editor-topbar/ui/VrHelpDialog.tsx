/**
 * Как открыть проект в VR: автономный Meta Quest 3/3+ и PC VR (Quest Link/Air Link, SteamVR).
 * @module widgets/editor-topbar/ui/VrHelpDialog
 */

import React from 'react';
import { needsSecureContext } from '@/features/vr/model/useVrSupport';
import { Button } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/overlay/Dialog';
import styles from './EditorTopBar.module.scss';

export const VrHelpDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Dialog title="Как открыть в VR" onClose={onClose} actions={<Button variant="primary" onClick={onClose}>Понятно</Button>}>
    {needsSecureContext() && (
      <p className={styles.note}>
        VR работает только по защищённой ссылке (https). Откройте проект по публичной ссылке, которую выводит скрипт запуска run.sh.
      </p>
    )}
    <strong>Meta Quest 3 / 3S / 3+</strong>
    <ol className={styles.steps}>
      <li>Откройте эту же ссылку в браузере шлема (Meta Quest Browser) и войдите в аккаунт.</li>
      <li>Откройте проект и нажмите «VR» — или кнопку VR в адресной строке браузера.</li>
      <li>Курок — взять предмет лучом, правый стик — повернуть его; левый стик — идти, правый — повернуться; стик вперёд — телепорт.</li>
      <li>Кнопка Y на левом контроллере — меню на запястье: каталог, удаление, свет, солнце, сохранение, выход.</li>
    </ol>
    <strong>PC VR (Windows)</strong>
    <ol className={styles.steps}>
      <li>Подключите шлем через Quest Link / Air Link или запустите SteamVR и сделайте его активным OpenXR-рантаймом.</li>
      <li>Откройте ссылку в Chrome или Edge на этом компьютере и нажмите «VR».</li>
    </ol>
  </Dialog>
);
