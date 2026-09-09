from pathlib import Path
import sys,json,wave
import numpy as np
O=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).parent/'effects';O.mkdir(parents=True,exist_ok=True)
SR=48000;rng=np.random.default_rng(412);report=[]
def time(d):return np.arange(round(d*SR))/SR
def env(t,d,attack=.008,decay=3):return np.minimum(t/max(attack,.001),1)*np.maximum(0,1-t/d)**decay
def band(d,lo,hi):
 n=round(d*SR);a=rng.normal(0,1,n);f=np.fft.rfftfreq(n,1/SR);weight=np.minimum(1,(f/max(lo,1))**3)/(1+(f/hi)**4);a=np.fft.irfft(np.fft.rfft(a)*weight,n);return a/max(np.std(a),1e-6)
def bell(d,f):
 t=time(d);a=sum(v*np.sin(2*np.pi*f*p*t)*np.exp(-t/(d*s)) for p,v,s in [(1,1,.38),(2,.18,.16),(3,.06,.09)])
 return a*np.minimum(t/.004,1)*np.minimum((d-t)/.035,1)
def chime(notes,step=.09,d=.55):
 a=np.zeros(round((d+(len(notes)-1)*step)*SR))
 for i,n in enumerate(notes):
  b=bell(d,440*2**((n-69)/12));j=round(i*step*SR);a[j:j+len(b)]+=b*.68**(i/4)
 return a

def whoosh(d=.28,heavy=False):
 t=time(d);f=np.linspace(540 if not heavy else 220,100 if not heavy else 48,len(t));a=band(d,180,4200 if not heavy else 2200)*np.sin(np.pi*t/d)**2
 return a*.5+np.sin(2*np.pi*np.cumsum(f)/SR)*env(t,d,.012,2)*.32

def impact(d=.28,metal=False,wet=False):
 t=time(d);a=band(d,150,2400)*env(t,d,.001,6)*.24+np.sin(2*np.pi*np.cumsum(np.linspace(180,55,len(t)))/SR)*env(t,d,.002,4)*.55
 if metal:a+=sum(np.sin(2*np.pi*f*t)*np.exp(-t*rate) for f,rate in [(830,14),(1297,19),(2110,30)])*.15
 if wet:a+=np.sin(2*np.pi*np.cumsum(240+500*np.exp(-t*22))/SR)*env(t,d,.003,3)*.5
 return a

def shimmer(d,up=True):
 t=time(d);f=260*(1+t/d*2) if up else 750/(1+t/d*3);a=np.sin(2*np.pi*np.cumsum(f)/SR)*.2
 a+=band(d,1400,6500)*.12;return a*np.sin(np.pi*t/d)**.8

def save(name,a,peak=-9,loop=False):
 a=np.asarray(a,dtype=float);a-=a.mean(axis=0)
 if loop:
  m=min(480,len(a)//8);w=np.linspace(0,1,m);w=w[:,None]if a.ndim==2 else w;delta=a[-1]-a[0];a[:m]+=delta/2*(1-w);a[-m:]-=delta/2*w
 else:
  m=min(240,len(a)//8);w=np.linspace(0,1,m);w=w[:,None]if a.ndim==2 else w;a[:m]*=w;a[-m:]*=w[::-1]
 a*=10**(peak/20)/max(abs(a).max(),1e-8)
 with wave.open(str(O/(name+'.wav')),'wb')as w:w.setnchannels(1 if a.ndim==1 else 2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((a*32767).astype('<i2').tobytes())
 report.append(dict(name=name,seconds=len(a)/SR,channels=1 if a.ndim==1 else 2,peakDBFS=peak,loop=loop,clipped=int((abs(a)>=1).sum())))
# UI / progression share A minor and the title's E-A-B-C motif.
for key,notes,step,d in [
 ('ui_hover',[88],.05,.11),('ui_click',[81,88],.035,.16),('ui_back',[76,72],.055,.19),('ui_open',[69,76],.065,.28),('ui_select',[81,83],.045,.23),('ui_error',[64,63],.08,.18),('ui_confirm',[76,81,83,84],.08,.5),('ui_save',[72,76,81],.09,.38),('equip',[64,76],.05,.32),('pickup',[76,81,88],.075,.4),('talk',[76,79],.1,.28),('rest',[69,72,76,81],.14,.8),('level_up',[76,81,83,84,88],.12,.8),('upgrade',[72,76,81,84],.085,.45),('revive',[64,69,76,81],.12,.8),('victory',[69,72,76,81,84,88],.16,1.15),('charge_ready',[83,88],.045,.24),('heal_start',[69,72,76,81],.085,.5),('heal_tick',[81,88],.06,.3)]:save(key,chime(notes,step,d),-16 if key=='ui_hover' else -11)
for key,d,heavy in [('slash',.25,False),('slash_heavy',.44,True),('fan',.6,True),('dash',.35,False),('roll',.38,False),('backstep',.23,False),('jump',.25,False),('wolf_charge',.7,True),('meteor_fall',.78,True)]:save(key,whoosh(d,heavy))
for key,d,metal,wet in [('player_hit',.28,False,False),('slime_hit',.23,False,True),('slime_attack',.25,False,True),('bee_hit',.22,False,False),('bee_attack',.16,False,False),('boss_hit',.38,False,False),('arrow_hit',.2,False,False),('block',.36,True,False),('shield_up',.22,True,False),('critical',.38,True,False),('trap_set',.3,True,False),('trap_trigger',.36,True,False),('land',.22,False,False),('wolf_bite',.35,False,False)]:save(key,impact(d,metal,wet))
# Layered bowstring / air, crystal and magic releases.
d=.3;t=time(d);save('bow_release',np.sin(2*np.pi*np.cumsum(370*np.exp(-t*6)+120)/SR)*env(t,d,.001,7)+whoosh(d)*.4)
d=.6;t=time(d);save('bow_draw',band(d,300,2500)*np.sin(np.pi*t/d)**2*.12+np.sin(2*np.pi*(220*t+60*t*t))*env(t,d,.05,1)*.2,-14)
save('energy_light',shimmer(.34,False)+bell(.34,659)*.35)
save('energy_heavy',shimmer(.6,False)+impact(.6)*.6)
save('ice_wave',shimmer(.5)+band(.5,2200,6500)*env(time(.5),.5,.015,2)*.25)
save('freeze',chime([93,88,81],.04,.36),-12)
save('blink',shimmer(.4)+chime([81,88],.08,.32)*.35)
save('parry',impact(.65,True)+bell(.65,1318)*.5,-8)
save('rain_start',whoosh(.8)+shimmer(.8)*.4)
save('rain_tick',band(.48,400,3800)*env(time(.48),.48,.02,2)+impact(.48)*.3,-13)
save('frost_storm',band(.9,300,4000)*np.sin(np.pi*time(.9)/.9)**2+shimmer(.9)*.4,-11)
save('meteor_hit',impact(1.2)*.8+band(1.2,35,900)*env(time(1.2),1.2,.002,3),-7)
save('slime_death',impact(.52,False,True)+shimmer(.52,False)*.3)
save('bee_death',shimmer(.45,False),-11)
save('death',chime([76,72,69,64],.21,1),-11)
save('boss_appear',chime([45,52,57],.18,1.5)+np.pad(impact(.9), (0,round((1.86-.9)*SR))),-9)
save('boss_warning',chime([64,65,64],.16,.36),-11)
d=1.6;t=time(d);f=180+200*np.sin(np.pi*t/d)**.6+4*np.sin(2*np.pi*5*t);phase=2*np.pi*np.cumsum(f)/SR;a=sum(np.sin(phase*k)*.5**k for k in range(1,6));save('wolf_howl',(a+band(d,500,1700)*.08)*np.sin(np.pi*t/d)**1.4,-10)
for i in range(3):
 d=.17;t=time(d);save('foot_'+str(i),band(d,180,1600)*env(t,d,.001,6)*.3+impact(d)*.2,-17)
# Seamless local and global ambience. No prerecorded environmental audio is used.
d=12;t=time(d);wind=np.column_stack([band(d,70,900),band(d,75,1050)]);wind*= (.68+.2*np.sin(2*np.pi*t/d))[:,None];save('ambient_wind',wind,-18,True)
crickets=np.zeros((len(t),2))
for at in [.4,1.7,3.2,5.1,7.7,9.5,10.8]:
 for k in range(3):
  dt=.055;u=time(dt);a=np.sin(2*np.pi*(2550+200*np.sin(at))*u)*np.sin(np.pi*u/dt)**2*.2;j=round((at+k*.13)*SR);pan=.25+.5*rng.random();crickets[j:j+len(a),0]+=a*(1-pan);crickets[j:j+len(a),1]+=a*pan
save('ambient_crickets',crickets,-22,True)
d=4;t=time(d);fire=band(d,80,1700)*.14
for at in rng.uniform(0,3.8,35):
 u=time(.06);a=band(.06,1000,5000)*env(u,.06,.001,7)*rng.uniform(.03,.18);j=round(at*SR);fire[j:j+len(a)]+=a
save('torch_fire',fire,-16,True);save('burn',fire+band(d,40,900)*.12,-12,True)
d=1;t=time(d);save('bee_buzz',(np.sin(2*np.pi*180*t)+.3*np.sin(2*np.pi*360*t))*(.8+.1*np.sin(2*np.pi*5*t)),-23,True)
save('charge_loop',sum(np.sin(2*np.pi*f*t)*v for f,v in [(220,.4),(330,.2),(440,.1)])*(.8+.15*np.sin(2*np.pi*3*t)),-17,True)
save('channel_fire',band(1,100,1400)*.2+np.sin(2*np.pi*110*t)*.1,-17,True)
save('channel_rain',band(1,400,3500)*.2+np.sin(2*np.pi*330*t)*.08,-18,True)
save('magic_hit',impact(.32)*.35+bell(.32,988)*.3,-11)
save('low_health',chime([69,64],.16,.35),-17)
(O/'effects-checks.json').write_text(json.dumps(report,indent=2));print('Created',len(report),'original cues and ambience loops')
