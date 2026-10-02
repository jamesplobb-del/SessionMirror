"""Add original synthetic practice audio to an otherwise empty simulator app.
Only for launch screenshots. Never touches a real device or release source.
"""
import json, math, pathlib, sqlite3, struct, sys, time, wave
root=pathlib.Path(sys.argv[1]).resolve()
assert '/CoreSimulator/Devices/' in str(root)
docs=root/'Documents'
db=sqlite3.connect(docs/'besttake_vaultSQLite.db')
assert db.execute("select count(*) from takes where id not like 'launch-demo-%'").fetchone()[0]==0
project=db.execute('select id from projects order by created_at limit 1').fetchone()[0]
(docs/'takes').mkdir(exist_ok=True)
now=int(time.time()*1000)
for take in [1,2]:
    ident=f'launch-demo-{take}'
    filename=f'takes/{ident}.wav'
    rate=22050; seconds=12
    frames=bytearray()
    notes=[233.0819,261.6256,293.6648,311.1270,349.2282,311.1270,293.6648,261.6256]
    for n in range(rate*seconds):
        t=n/rate; part=min(7,int(t/1.5)); phase=t%1.5
        env=min(1,phase/.06,max(0,(1.32-phase)/.18))*.17
        hz=notes[part]*(2**((2.5*math.sin(t*5)+take)/1200))
        sample=env*(math.sin(2*math.pi*hz*t)+.2*math.sin(4*math.pi*hz*t))
        frames.extend(struct.pack('<h',round(sample*32767)))
    with wave.open(str(docs/filename),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(frames)
    series=[{'time':round(n/20,2),'frequencyHz':notes[min(7,int((n/20)/1.5))]} for n in range(240)]
    db.execute('''insert or replace into takes(id,project_id,file_path,duration,is_best_take,created_at,name,mime_type,media_type,rating,notes,pitch_series_json)
    values(?,?,?,?,?,?,?,?,?,?,?,?)''',(ident,project,filename,seconds,1 if take==1 else 0,now-(3-take)*120000,f'Phrase — take {take}','audio/wav','audio',0,'',json.dumps(series)))
db.commit();db.close()
print('Added two original demo takes to the simulator.')
