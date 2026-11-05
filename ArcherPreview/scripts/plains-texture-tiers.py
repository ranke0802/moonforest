import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'Sources'))
from resolve_source import source_path, project_path, tool_path
"""Deterministic texture resizing/encoding for approved Meshy model output."""
from pathlib import Path
from PIL import Image
import subprocess,sys
folder=Path(sys.argv[1]); source=Path(sys.argv[2])
ktx=Path(tool_path('ktx'))
with Image.open(source) as im:
 for size in (2048,1024,512,256):
  png=folder/f'color-{size}.png';out=folder/f'color-{size}.ktx2'
  im.convert('RGB').resize((size,size),Image.Resampling.LANCZOS).save(png)
  if not out.exists():subprocess.run([str(ktx),'create','--format','R8G8B8_SRGB','--encode','basis-lz','--qlevel','220','--clevel','1','--generate-mipmap','--threads','4',str(png),str(out)],check=True,capture_output=True)
