from pathlib import Path
root=Path(__file__).parent
for name in ['scoring.py','ui_v4.py']:
 p=root/name;s=p.read_text(encoding='utf-8').replace('2:.35,3:.2,4:.05','2:.3,3:.2,4:.1').replace('40% / 35% / 20% / 5%','40% / 30% / 20% / 10%').replace('40%、35%、20%、5%','40%、30%、20%、10%');p.write_text(s,encoding='utf-8')
