/** Continue a CPU browser flow through the required ordered preview stage. */
export async function selectTeamPreview(page,indices){
  await page.getByRole('main',{name:'팀 프리뷰와 선출'}).waitFor();
  const count=await page.locator('.team-preview-slot').count();
  const order=indices??Array.from({length:count},(_,index)=>index);
  for(const index of order)await page.locator('.team-preview-roster').first().getByRole('button').nth(index).click();
  await page.getByRole('button',{name:`${count}마리 선출 완료`}).click();
  const begin=page.getByRole('button',{name:'배틀 시작',exact:true});
  await begin.waitFor();await begin.click();
  await page.locator('.battle-scene').waitFor();
}
