using System.Runtime.InteropServices;
using System.Text.Json;
using Windows.Devices.Radios;
using Windows.Networking.Connectivity;
using Windows.Media.Control;
using Windows.Storage.Streams;

internal static class Program {
    static readonly object OutputLock=new();
    static volatile bool dirty=true;
    static GlobalSystemMediaTransportControlsSessionManager? manager;
    static GlobalSystemMediaTransportControlsSession? media;
    static IReadOnlyList<Radio> radios=Array.Empty<Radio>();
    static string bluetooth="unknown",title="",artist="",art="";
    static volatile bool mediaDirty=true;
    static readonly AudioEndpoint audio=new(()=>dirty=true);
    static void Emit(object value) { lock(OutputLock) Console.WriteLine(JsonSerializer.Serialize(value)); }
    static async Task Main() {
        Console.InputEncoding=System.Text.Encoding.UTF8;Console.OutputEncoding=new System.Text.UTF8Encoding(false);
        using var stop=new CancellationTokenSource();
        NetworkInformation.NetworkStatusChanged+=_=>dirty=true;
        try {radios=await Radio.GetRadiosAsync();bluetooth=radios.Any(r=>r.Kind==RadioKind.Bluetooth)?"off":"missing";foreach(var r in radios)r.StateChanged+=(_,_)=>dirty=true;}catch(UnauthorizedAccessException){bluetooth="denied";}catch{}
        var updates=Task.Run(async()=>{
            string last="";var next=DateTime.MinValue;
            while(!stop.IsCancellationRequested){
                if(dirty||DateTime.UtcNow>=next){dirty=false;next=DateTime.UtcNow.AddSeconds(5);try{var snapshot=await Snapshot();var json=JsonSerializer.Serialize(snapshot);if(json!=last){lock(OutputLock)Console.WriteLine(json);last=json;}}catch{Emit(new{type="system.snapshot"});}}
                try{await Task.Delay(100,stop.Token);}catch(OperationCanceledException){break;}
            }
        });
        try{
            while(await Console.In.ReadLineAsync() is {} line){
                string id="";try{
                    if(line.Length>1024)continue;
                    using var doc=JsonDocument.Parse(line);var root=doc.RootElement;id=root.GetProperty("id").GetString()??"";
                    if(id.Length>30||root.GetProperty("type").GetString()!="command")continue;
                    var action=root.GetProperty("action").GetString();bool ok;
                    switch(action){
                        case "audio.volume":var volume=root.GetProperty("value").GetSingle();ok=float.IsFinite(volume)&&volume>=0&&volume<=1&&audio.SetVolume(volume);break;
                        case "audio.mute":ok=audio.SetMute(root.GetProperty("value").GetBoolean());break;
                        case "media.playPause":ok=media!=null&&await media.TryTogglePlayPauseAsync();break;
                        case "media.next":ok=media!=null&&await media.TrySkipNextAsync();break;
                        case "media.previous":ok=media!=null&&await media.TrySkipPreviousAsync();break;
                        default:ok=false;break;
                    }
                    dirty=true;Emit(new{type="command.result",id,ok});
                }catch{Emit(new{type="command.result",id,ok=false});}
            }
        }finally{stop.Cancel();await updates;audio.Dispose();}
    }
    static void MetadataChanged(GlobalSystemMediaTransportControlsSession s,MediaPropertiesChangedEventArgs e){mediaDirty=true;dirty=true;}
    static void PlaybackChanged(GlobalSystemMediaTransportControlsSession s,PlaybackInfoChangedEventArgs e)=>dirty=true;
    static async Task<object> Snapshot(){
        if(manager==null){try{manager=await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();manager.CurrentSessionChanged+=(_,_)=>{mediaDirty=true;dirty=true;};manager.SessionsChanged+=(_,_)=>dirty=true;}catch{}}
        var selected=manager?.GetCurrentSession();
        if(selected!=media){if(media!=null){media.MediaPropertiesChanged-=MetadataChanged;media.PlaybackInfoChanged-=PlaybackChanged;}media=selected;title=artist=art="";mediaDirty=true;if(media!=null){media.MediaPropertiesChanged+=MetadataChanged;media.PlaybackInfoChanged+=PlaybackChanged;}}
        if(media!=null&&mediaDirty){mediaDirty=false;try{var props=await media.TryGetMediaPropertiesAsync();title=props.Title;artist=props.Artist;art="";if(props.Thumbnail!=null){using var stream=await props.Thumbnail.OpenReadAsync();if(stream.Size>0&&stream.Size<=250000&&(stream.ContentType=="image/jpeg"||stream.ContentType=="image/png")){using var reader=new DataReader(stream);await reader.LoadAsync((uint)stream.Size);var bytes=new byte[(int)stream.Size];reader.ReadBytes(bytes);art="data:"+stream.ContentType+";base64,"+Convert.ToBase64String(bytes);}}}catch{title="Medya bilgisi alınamadı";artist=art="";}}
        var info=media?.GetPlaybackInfo();var controls=info?.Controls;
        object wifi;try{var profile=NetworkInformation.GetConnectionProfiles().FirstOrDefault(p=>p.IsWlanConnectionProfile&&p.GetNetworkConnectivityLevel()!=NetworkConnectivityLevel.None);wifi=profile==null?new{status="disconnected",name="",signal=0}:new{status="connected",name=profile.WlanConnectionProfileDetails.GetConnectedSsid(),signal=(int)(profile.GetSignalBars()??0)};}catch(UnauthorizedAccessException){wifi=new{status="denied",name="",signal=0};}catch{wifi=new{status="unknown",name="",signal=0};}
        var bt=radios.FirstOrDefault(r=>r.Kind==RadioKind.Bluetooth);if(bt!=null)bluetooth=bt.State==RadioState.On?"on":bt.State==RadioState.Disabled?"denied":"off";
        return new{type="system.snapshot",audio=audio.Read(),wifi,bluetooth=new{status=bluetooth},media=new{available=media!=null,title,artist,art,playing=info?.PlaybackStatus==GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing,canPlay=controls?.IsPlayEnabled??false,canPause=controls?.IsPauseEnabled??false,canNext=controls?.IsNextEnabled??false,canPrevious=controls?.IsPreviousEnabled??false}};
    }
}

// Core Audio COM interfaces use the native vtable order, including unused methods.
[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
[ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int flow,int mask,out IntPtr devices);
    [PreserveSig]int GetDefaultAudioEndpoint(int flow,int role,out IMMDevice device);
}
[ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice {
    [PreserveSig]int Activate(ref Guid iid,int context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)]out object instance);
    int OpenPropertyStore(int access,out IntPtr properties);
    [PreserveSig]int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);
}
[ComImport,Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioEndpointVolume {
    [PreserveSig]int RegisterControlChangeNotify(IVolumeCallback callback);
    [PreserveSig]int UnregisterControlChangeNotify(IVolumeCallback callback);
    int GetChannelCount(out uint count);
    int SetMasterVolumeLevel(float level,ref Guid context);
    [PreserveSig]int SetMasterVolumeLevelScalar(float level,ref Guid context);
    int GetMasterVolumeLevel(out float level);
    [PreserveSig]int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint channel,float level,ref Guid context);
    int SetChannelVolumeLevelScalar(uint channel,float level,ref Guid context);
    int GetChannelVolumeLevel(uint channel,out float level);
    int GetChannelVolumeLevelScalar(uint channel,out float level);
    [PreserveSig]int SetMute([MarshalAs(UnmanagedType.Bool)]bool mute,ref Guid context);
    [PreserveSig]int GetMute([MarshalAs(UnmanagedType.Bool)]out bool mute);
}
[ComVisible(true),Guid("657804FA-D6AD-4496-8A60-352752AF4F89"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IVolumeCallback { [PreserveSig]int OnNotify(IntPtr data); }
[ComVisible(true),ClassInterface(ClassInterfaceType.None)] public class VolumeCallback(Action changed):IVolumeCallback { public int OnNotify(IntPtr data){changed();return 0;} }
sealed class AudioEndpoint(Action changed):IDisposable {
    readonly object gate=new();readonly VolumeCallback callback=new(changed);IAudioEndpointVolume? endpoint;string deviceId="";
    void Refresh(){
        IMMDeviceEnumerator? enumerator=null;IMMDevice? device=null;
        try{enumerator=(IMMDeviceEnumerator)new MMDeviceEnumerator();Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0,1,out device));Marshal.ThrowExceptionForHR(device.GetId(out var id));if(id==deviceId&&endpoint!=null)return;DisposeEndpoint();var iid=typeof(IAudioEndpointVolume).GUID;Marshal.ThrowExceptionForHR(device.Activate(ref iid,23,IntPtr.Zero,out var instance));endpoint=(IAudioEndpointVolume)instance;Marshal.ThrowExceptionForHR(endpoint.RegisterControlChangeNotify(callback));deviceId=id;}catch{DisposeEndpoint();}finally{if(device!=null)Marshal.ReleaseComObject(device);if(enumerator!=null)Marshal.ReleaseComObject(enumerator);}
    }
    void DisposeEndpoint(){if(endpoint!=null){try{endpoint.UnregisterControlChangeNotify(callback);}catch{}Marshal.ReleaseComObject(endpoint);endpoint=null;}deviceId="";}
    public object Read(){lock(gate){Refresh();if(endpoint==null)return new{available=false,volume=0f,muted=false};try{Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out var v));Marshal.ThrowExceptionForHR(endpoint.GetMute(out var m));return new{available=true,volume=v,muted=m};}catch{return new{available=false,volume=0f,muted=false};}}}
    public bool SetVolume(float volume){lock(gate){Refresh();var context=Guid.Empty;return endpoint!=null&&endpoint.SetMasterVolumeLevelScalar(volume,ref context)>=0;}}
    public bool SetMute(bool mute){lock(gate){Refresh();var context=Guid.Empty;return endpoint!=null&&endpoint.SetMute(mute,ref context)>=0;}}
    public void Dispose(){lock(gate)DisposeEndpoint();}
}
