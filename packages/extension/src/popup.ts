/** Shows what this tab currently offers an agent. No chat, by design. */
type Tool = { name: string; source: 'native' | 'grafted'; consequential: boolean };

async function render() {
  const dot = document.getElementById('dot')!;
  const state = document.getElementById('state')!;
  const list = document.getElementById('tools')!;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) { state.textContent = 'no active tab'; return; }

  let tools: Tool[] = [];
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { op: 'readTab' });
    tools = res?.state?.tools ?? [];
  } catch {
    state.textContent = 'Deputy is not running on this page';
    return;
  }

  dot.classList.toggle('on', tools.length > 0);
  state.textContent = tools.length
    ? `${tools.length} tool${tools.length === 1 ? '' : 's'} on this page`
    : 'no tools on this page';

  list.innerHTML = '';
  for (const t of tools) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = t.name;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = t.source === 'native' ? 'site' : 'grafted';
    li.append(code, tag);
    if (t.consequential) {
      const c = document.createElement('span');
      c.className = 'tag';
      c.textContent = '· asks first';
      li.append(c);
    }
    list.append(li);
  }
}
void render();
