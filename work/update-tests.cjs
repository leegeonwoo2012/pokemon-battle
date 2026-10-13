const fs=require('node:fs');let s=fs.readFileSync('src/App.test.tsx','utf8');s=s.replace('screen, within','screen, within, waitFor');s=s.replace("it('edits, saves, reloads a team and plays a singles turn', () =>", "it('edits, saves, reloads a team and plays a singles turn', async () =>");s=s.replace("it('selects two actions and distinct targets in a doubles turn', () =>", "it('selects two actions and distinct targets in a doubles turn', async () =>");s=s.replaceAll("    expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 02');", "    await waitFor(() => expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 02'));\n    await waitFor(() => expect(document.querySelector('.battle-scene')?.getAttribute('aria-busy')).toBe('false'));");const start=s.indexOf("  it('resolves facing sprites");s=s.slice(0,start)+`  it('marks artwork as incomplete without requesting nonexistent sprite files', () => {
    render(<App />);
    expect(screen.getByText('이미지 라이브러리 미완성')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /싱글 배틀 시작/ }));
    const player=screen.getByRole('img', { name:'피카츄 후면 이미지 미완성' });
    expect(player.querySelector('img')).toBeNull();
    expect(screen.queryByText('스프라이트 미제공')).toBeNull();
  });

  it('searches 180 species and filters ten representatives while keeping dual types', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '포켓몬 목록', exact:true }));
    expect(document.querySelectorAll('.dex-card')).toHaveLength(180);
    fireEvent.change(screen.getByLabelText('도감 대표 타입'), {target:{value:'fire'}});
    expect(document.querySelectorAll('.dex-card')).toHaveLength(10);
    fireEvent.change(screen.getByPlaceholderText('포켓몬 검색'), {target:{value:'리자몽'}});
    expect(document.querySelectorAll('.dex-card')).toHaveLength(1);
    expect(document.querySelector('.dex-card .type-flying')).toBeTruthy();
  });
});\n`;
fs.writeFileSync('src/App.test.tsx',s);
