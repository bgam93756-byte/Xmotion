import { useEditor } from '../state/store';
import { Editor } from './Editor';
import { Home } from './Home';

export function App() {
  const hasProject = useEditor((s) => !!s.project);
  return hasProject ? <Editor /> : <Home />;
}
