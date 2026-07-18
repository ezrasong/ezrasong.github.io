import './styles/main.css';
import { App } from './app/App';

const canvasHost = document.getElementById('canvas-host')!;
const uiHost = document.getElementById('ui-host')!;

const app = new App();
void app.init(canvasHost, uiHost);
