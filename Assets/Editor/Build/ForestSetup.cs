using UnityEngine;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEditor.Build.Reporting;
using UnityEngine.Rendering;
using System;
using System.IO;
using System.Linq;
using WitchPlayground;
public class ForestImporter:AssetPostprocessor {
 void OnPreprocessModel(){if(!assetPath.EndsWith("/Forest.fbx"))return;var m=(ModelImporter)assetImporter;m.importAnimation=false;m.importCameras=false;m.importLights=false;m.materialImportMode=ModelImporterMaterialImportMode.ImportStandard;m.isReadable=true;m.meshCompression=ModelImporterMeshCompression.Off;}
 void OnPreprocessTexture(){if(!assetPath.Contains("Art/Forest"))return;var t=(TextureImporter)assetImporter;t.maxTextureSize=2048;t.alphaIsTransparency=assetPath.EndsWith("Foliage.png");if(assetPath.Contains("Normal"))t.textureType=TextureImporterType.NormalMap;}
}
public static class ForestSetup {
 const string ScenePath="Assets/Scenes/MoonlitForest.unity";
 public static void Deliver(){string output=Path.GetFullPath("../WitchMoonlitForest.app");var args=Environment.GetCommandLineArgs();int outIndex=Array.IndexOf(args,"--v4-build-output");if(outIndex>=0&&outIndex+1<args.Length)output=args[outIndex+1];EditorSceneManager.OpenScene(ScenePath);Directory.CreateDirectory("Verification");var r=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{ScenePath},locationPathName=output,target=BuildTarget.StandaloneOSX,options=BuildOptions.CleanBuildCache});File.WriteAllText("Verification/build.json","{\"result\":\""+r.summary.result+"\",\"errors\":"+r.summary.totalErrors+",\"warnings\":"+r.summary.totalWarnings+"}");if(r.summary.result!=BuildResult.Succeeded)throw new Exception("Build failed");Debug.Log("FOREST_BUILD_OK");}
}
