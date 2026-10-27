import './style.css';
import { Game } from './game';

window.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  if (app) {
    new Game(app);
  }
});
