import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VersionService } from './core/version.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [`:host { display: block; }`],
})
export class App {
  constructor() {
    inject(VersionService).start();
  }
}
