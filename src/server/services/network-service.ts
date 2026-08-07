import { ReplicatedStorage } from "@rbxts/services";
import {
  COMMAND_REMOTE_NAME,
  EVENT_REMOTE_NAME,
  REMOTE_FOLDER_NAME,
  type ServerEvent,
} from "shared/network/protocol";

export class NetworkService {
  private readonly command: RemoteEvent;
  private readonly event: RemoteEvent;
  private handler: ((player: Player, payload: unknown) => void) | undefined;

  public constructor() {
    const oldFolder = ReplicatedStorage.FindFirstChild(REMOTE_FOLDER_NAME);
    if (oldFolder !== undefined) {
      oldFolder.Destroy();
    }

    const folder = new Instance("Folder");
    folder.Name = REMOTE_FOLDER_NAME;
    folder.Parent = ReplicatedStorage;

    this.command = new Instance("RemoteEvent");
    this.command.Name = COMMAND_REMOTE_NAME;
    this.command.Parent = folder;

    this.event = new Instance("RemoteEvent");
    this.event.Name = EVENT_REMOTE_NAME;
    this.event.Parent = folder;

    this.command.OnServerEvent.Connect((player, payload: unknown) => {
      this.handler?.(player, payload);
    });
  }

  public setCommandHandler(handler: (player: Player, payload: unknown) => void): void {
    this.handler = handler;
  }

  public send(player: Player, payload: ServerEvent): void {
    this.event.FireClient(player, payload);
  }

  public sendAll(payload: ServerEvent): void {
    this.event.FireAllClients(payload);
  }
}
