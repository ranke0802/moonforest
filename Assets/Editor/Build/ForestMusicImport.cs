using UnityEngine;using UnityEditor;using System.IO;
public sealed class ForestMusicImport:AssetPostprocessor {
 void OnPreprocessAudio(){if(!assetPath.StartsWith("Assets/Resources/Audio/"))return;Apply((AudioImporter)assetImporter);}
 public static void Apply(AudioImporter importer){var s=importer.defaultSampleSettings;s.loadType=AudioClipLoadType.DecompressOnLoad;s.compressionFormat=AudioCompressionFormat.PCM;s.sampleRateSetting=AudioSampleRateSetting.PreserveSampleRate;importer.defaultSampleSettings=s;importer.forceToMono=false;importer.loadInBackground=false;}
 public static void Deliver(){foreach(var file in Directory.GetFiles("Assets/Resources/Audio","*.wav",SearchOption.AllDirectories)){var a=(AudioImporter)AssetImporter.GetAtPath(file);Apply(a);a.SaveAndReimport();}ForestSetup.Deliver();}
}
