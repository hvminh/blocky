/*
 * Copyright © 2016-2017 The Blocky Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import './side-menu.scss';

import blockyMenu from '../services/menu.service';
import blockyMenuLink from './menu-link.directive';

/* eslint-disable import/no-unresolved, import/default */

import sidemenuTemplate from './side-menu.tpl.html';

/* eslint-enable import/no-unresolved, import/default */

export default angular.module('blocky.directives.sideMenu', [blockyMenu, blockyMenuLink])
    .directive('tbSideMenu', SideMenu)
    .name;

/*@ngInject*/
function SideMenu($compile, $templateCache, menu) {

    var linker = function (scope, element) {

        scope.sections = menu.getSections();

        var template = $templateCache.get(sidemenuTemplate);

        element.html(template);

        $compile(element.contents())(scope);
    }

    return {
        restrict: "E",
        link: linker,
        scope: {}
    };
}