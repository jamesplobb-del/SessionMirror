"""Populate a fresh simulator's native multitrack UI with original demo audio."""
import json, pathlib, sqlite3, sys
root=pathlib.Path(sys.argv[1]).resolve()
assert '/CoreSimulator/Devices/' in str(root)
db=sqlite3.connect(root/'Documents/besttake_vaultSQLite.db')
assert db.execute("select count(*) from takes where id not like 'launch-demo-%'").fetchone()[0]==0
cols=[r[1] for r in db.execute('pragma table_info(takes)')]
for i,label in [(3,'Harmony'),(4,'Bass line')]:
    row=list(db.execute('select * from takes where id=?',(f'launch-demo-{i-2}',)).fetchone())
    row[cols.index('id')]=f'launch-demo-{i}';row[cols.index('name')]=label;row[cols.index('is_best_take')]=0
    db.execute('insert or replace into takes values('+','.join('?' for _ in row)+')',row)
db.commit();db.close()
p=next(root.glob('Library/WebKit/**/LocalStorage/localstorage.sqlite3'))
c=sqlite3.connect(p)
project='launch-demo-quartet'
session={'layoutId':'four','layoutStyle':{'gap':16,'cornerRadius':12},'projectId':project,'name':'Four-part practice','endSec':12,'panelTakeIds':[f'launch-demo-{i}' for i in range(1,5)],'panelDetails':[{'label':n} for n in ['Melody','Countermelody','Harmony','Bass line']],'practice':{'bpm':80,'meter':'4/4','showMetronome':False,'showPitch':False,'practiceOverlayEnabled':False,'clickEnabled':False,'countInBars':1},'backing':{'kind':'none','volume':1}}
values={'sm.multitrack.session.v1':json.dumps(session),'sm.multitrack.session.v1.'+project:json.dumps(session),'sm.multitrack.active.v2':project,'sm.multitrack.projects.v2':json.dumps([{'id':project,'name':'Four-part practice','updatedAt':1790604000000}]),'besttake:feature-help:v1':json.dumps({'enabled':False,'seen':[]})}
for k,v in values.items():c.execute('insert or replace into ItemTable(key,value) values(?,?)',(k,v.encode('utf-16-le')))
c.commit();c.close()
print('Seeded four-part demo in simulator')
